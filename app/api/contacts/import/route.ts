import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth/auth';
import { detectCsvDelimiter, parseCsv, type CsvDelimiter } from '@/lib/utils/csv';
import { normalizePhoneE164 } from '@/lib/phone';

const ImportModeSchema = z.enum(['create_only', 'upsert_by_email', 'skip_duplicates_by_email']);
type ImportMode = z.infer<typeof ImportModeSchema>;

const BooleanStringSchema = z
  .string()
  .optional()
  .transform(v => (v ?? '').toLowerCase())
  .transform(v => v === 'true' || v === '1' || v === 'yes' || v === 'on');

function normalizeHeader(h: string) {
  return (h || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

type ParsedRow = {
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  role?: string;
  company?: string;
  status?: string;
  stage?: string;
  notes?: string;
};

const HEADER_SYNONYMS: Record<keyof ParsedRow, string[]> = {
  name: ['name', 'nome', 'nome completo', 'full name'],
  firstName: ['first name', 'firstname', 'primeiro nome', 'nome'],
  lastName: ['last name', 'lastname', 'sobrenome'],
  email: ['email', 'e-mail', 'e-mail address', 'mail'],
  phone: ['phone', 'telefone', 'celular', 'whatsapp', 'fone'],
  role: ['role', 'cargo', 'titulo', 'title', 'funcao', 'funçao', 'funcao/cargo'],
  company: ['company', 'empresa', 'conta', 'account', 'organization', 'organizacao', 'organização'],
  status: ['status'],
  stage: ['stage', 'etapa', 'lifecycle stage', 'ciclo de vida', 'pipeline stage'],
  notes: ['notes', 'nota', 'notas', 'observacoes', 'observações', 'obs'],
};

function buildHeaderIndex(headers: string[]) {
  const idx = new Map<string, number>();
  headers.forEach((h, i) => idx.set(normalizeHeader(h), i));

  const find = (syns: string[]) => {
    for (const s of syns) {
      const key = normalizeHeader(s);
      const found = idx.get(key);
      if (found !== undefined) return found;
    }
    return undefined;
  };

  const mapping: Record<keyof ParsedRow, number | undefined> = {
    name: find(HEADER_SYNONYMS.name),
    firstName: find(HEADER_SYNONYMS.firstName),
    lastName: find(HEADER_SYNONYMS.lastName),
    email: find(HEADER_SYNONYMS.email),
    phone: find(HEADER_SYNONYMS.phone),
    role: find(HEADER_SYNONYMS.role),
    company: find(HEADER_SYNONYMS.company),
    status: find(HEADER_SYNONYMS.status),
    stage: find(HEADER_SYNONYMS.stage),
    notes: find(HEADER_SYNONYMS.notes),
  };

  return mapping;
}

function getCell(row: string[], idx: number | undefined): string | undefined {
  if (idx === undefined) return undefined;
  const v = row[idx];
  const t = (v ?? '').trim();
  return t ? t : undefined;
}

function normalizeStatus(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const s = normalizeHeader(v).toUpperCase();
  if (s === 'ACTIVE' || s === 'ATIVO') return 'ACTIVE';
  if (s === 'INACTIVE' || s === 'INATIVO') return 'INACTIVE';
  if (s === 'CHURNED' || s === 'PERDIDO' || s === 'CANCELADO') return 'CHURNED';
  return undefined;
}

function normalizeStage(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const s = normalizeHeader(v).toUpperCase();
  if (s === 'LEAD') return 'LEAD';
  if (s === 'MQL') return 'MQL';
  if (s === 'PROSPECT' || s === 'OPORTUNIDADE') return 'PROSPECT';
  if (s === 'CUSTOMER' || s === 'CLIENTE') return 'CUSTOMER';
  if (s === 'OTHER' || s === 'OUTRO' || s === 'OUTROS') return 'OTHER';
  return undefined;
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    const modeRaw = form.get('mode');
    const delimiterRaw = form.get('delimiter');
    const createCompanies = BooleanStringSchema.parse(String(form.get('createCompanies') ?? 'true'));

    const modeResult = ImportModeSchema.safeParse(String(modeRaw ?? 'upsert_by_email'));
    if (!modeResult.success) {
      return NextResponse.json({ error: 'Parâmetro mode inválido.' }, { status: 400 });
    }
    const mode: ImportMode = modeResult.data;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Arquivo CSV não enviado (field "file").' }, { status: 400 });
    }

    const text = await file.text();
    const delimiter: CsvDelimiter =
      delimiterRaw === ',' || delimiterRaw === ';' || delimiterRaw === '\t'
        ? (delimiterRaw as CsvDelimiter)
        : detectCsvDelimiter(text);

    const { headers, rows } = parseCsv(text, delimiter);
    if (!headers.length) {
      return NextResponse.json({ error: 'CSV sem cabeçalho.' }, { status: 400 });
    }

    const mapping = buildHeaderIndex(headers);

    const parsed: Array<{ rowNumber: number; data: ParsedRow }> = [];
    const errors: Array<{ rowNumber: number; message: string }> = [];

    for (let i = 0; i < rows.length; i += 1) {
      const r = rows[i];
      const rowNumber = i + 2;

      const firstName = getCell(r, mapping.firstName);
      const lastName = getCell(r, mapping.lastName);
      const name = getCell(r, mapping.name);
      const email = getCell(r, mapping.email);

      const computedName =
        (firstName || lastName)
          ? [firstName, lastName].filter(Boolean).join(' ').trim()
          : name;

      if (!computedName && !email) {
        errors.push({ rowNumber, message: 'Linha sem nome e sem email (não consigo criar contato).' });
        continue;
      }

      parsed.push({
        rowNumber,
        data: {
          name: computedName,
          email,
          phone: getCell(r, mapping.phone),
          role: getCell(r, mapping.role),
          company: getCell(r, mapping.company),
          status: normalizeStatus(getCell(r, mapping.status)),
          stage: normalizeStage(getCell(r, mapping.stage)),
          notes: getCell(r, mapping.notes),
        },
      });
    }

    if (!parsed.length) {
      return NextResponse.json(
        { error: 'Nenhuma linha válida para importar.', errors },
        { status: 400 }
      );
    }

    // Get session to find the user's organization
    const session = await auth();
    const userId = session?.user?.id;
    let organizationId: string | null = null;
    if (userId) {
      const profile = await prisma.profile.findUnique({
        where: { id: userId },
        select: { organizationId: true },
      });
      organizationId = profile?.organizationId ?? null;
    }

    // Companies: preload and optionally create missing ones
    const companies = await prisma.crmCompany.findMany({
      where: { deletedAt: null, ...(organizationId ? { organizationId } : {}) },
      select: { id: true, name: true },
    });

    const companyIdByName = new Map<string, string>();
    for (const c of companies) {
      if (c.id && c.name) companyIdByName.set(normalizeHeader(c.name), c.id);
    }

    const missingCompanies = new Set<string>();
    if (createCompanies) {
      for (const p of parsed) {
        const companyName = (p.data.company || '').trim();
        if (!companyName) continue;
        const key = normalizeHeader(companyName);
        if (!companyIdByName.has(key)) missingCompanies.add(companyName);
      }
    }

    if (createCompanies && missingCompanies.size) {
      for (const name of missingCompanies) {
        try {
          const created = await prisma.crmCompany.create({
            data: { name, ...(organizationId ? { organizationId } : {}) },
            select: { id: true, name: true },
          });
          if (created.id && created.name) companyIdByName.set(normalizeHeader(created.name), created.id);
        } catch {
          // skip if creation fails (e.g. unique constraint)
        }
      }
    }

    // Existing contacts by email (batch)
    const emails = Array.from(
      new Set(
        parsed
          .map(p => (p.data.email || '').trim().toLowerCase())
          .filter(Boolean)
      )
    );

    const contactIdsByEmail = new Map<string, string[]>();
    if (emails.length) {
      const existingContacts = await prisma.contact.findMany({
        where: {
          email: { in: emails },
          deletedAt: null,
          ...(organizationId ? { organizationId } : {}),
        },
        select: { id: true, email: true },
      });
      for (const c of existingContacts) {
        const em = (c.email || '').toLowerCase().trim();
        if (!em) continue;
        const arr = contactIdsByEmail.get(em) || [];
        arr.push(c.id);
        contactIdsByEmail.set(em, arr);
      }
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;

    const insertBatch: Array<{ rowNumber: number; payload: any }> = [];
    const flushInsert = async () => {
      if (!insertBatch.length) return;
      try {
        await prisma.contact.createMany({
          data: insertBatch.map(i => i.payload),
        });
        created += insertBatch.length;
      } catch (insertError: any) {
        for (const item of insertBatch) {
          errors.push({ rowNumber: item.rowNumber, message: insertError.message });
        }
      }
      insertBatch.length = 0;
    };

    for (const p of parsed) {
      const rowNumber = p.rowNumber;
      const email = (p.data.email || '').trim().toLowerCase();
      const phoneE164 = p.data.phone ? normalizePhoneE164(p.data.phone) : undefined;
      const companyName = (p.data.company || '').trim();
      const companyId = companyName ? companyIdByName.get(normalizeHeader(companyName)) : undefined;

      const base: any = {
        name: p.data.name || '',
        email: p.data.email || null,
        phone: phoneE164 || null,
        role: p.data.role || null,
        clientCompanyId: companyId || null,
        notes: p.data.notes || null,
        status: p.data.status || 'ACTIVE',
        stage: p.data.stage || 'LEAD',
        ...(organizationId ? { organizationId } : {}),
      };

      const existingIds = email ? (contactIdsByEmail.get(email) || []) : [];

      if (mode === 'create_only') {
        insertBatch.push({ rowNumber, payload: base });
        if (insertBatch.length >= 200) await flushInsert();
        continue;
      }

      if (mode === 'skip_duplicates_by_email' && existingIds.length > 0) {
        skipped += 1;
        continue;
      }

      if (mode === 'upsert_by_email' && existingIds.length > 0) {
        if (existingIds.length > 1) {
          errors.push({ rowNumber, message: `Email duplicado no CRM (${existingIds.length} registros). Importação ambígua.` });
          continue;
        }
        const id = existingIds[0];
        try {
          await prisma.contact.update({
            where: { id },
            data: base,
          });
          updated += 1;
        } catch (updateError: any) {
          errors.push({ rowNumber, message: updateError.message });
        }
        continue;
      }

      insertBatch.push({ rowNumber, payload: base });
      if (insertBatch.length >= 200) await flushInsert();
    }

    await flushInsert();

    return NextResponse.json({
      ok: true,
      delimiter,
      mode,
      totals: {
        rows: rows.length,
        parsed: parsed.length,
        created,
        updated,
        skipped,
        errors: errors.length,
      },
      errors,
      detectedHeaders: headers,
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error)?.message || 'Erro inesperado' },
      { status: 500 }
    );
  }
}
