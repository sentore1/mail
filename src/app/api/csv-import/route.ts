/**
 * CSV Import endpoint
 *
 * POST — import CSV with optional column mapping
 * PUT  — auto-detect column mapping from headers
 *
 * Accepts any CSV format (Apollo, Hunter, LinkedIn, Instantly, custom).
 * The mapping tells us which CSV column index maps to which CRM field.
 *
 * Saved fields:
 *   company_name, email, phone, website, niche, location,
 *   company_context, first_name, last_name, notes, status
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

// ─── CSV parser ───────────────────────────────────────────────────────────────

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  const parseRow = (line: string): string[] => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        values.push(current.trim().replace(/^"|"$/g, ''));
        current = '';
      } else {
        current += ch;
      }
    }
    values.push(current.trim().replace(/^"|"$/g, ''));
    return values;
  };

  const headers = parseRow(lines[0]).map(h => h.toLowerCase().trim());
  const rows = lines.slice(1).map(parseRow);
  return { headers, rows };
}

// ─── Auto-detect column mapping ───────────────────────────────────────────────

const FIELD_ALIASES: Record<string, string[]> = {
  company_name:    ['company_name','company name','company','organization','business','business name','account','account name','firm'],
  email:           ['email','email address','e-mail','e mail','work email','business email','contact email'],
  phone:           ['phone','phone number','telephone','mobile','cell','contact number','tel'],
  website:         ['website','url','web','domain','homepage','site','company url','company website'],
  niche:           ['niche','industry','sector','category','type','vertical','business type'],
  location:        ['location','city','country','region','area','address','state','place'],
  first_name:      ['first_name','first name','firstname','given name','fname'],
  last_name:       ['last_name','last name','lastname','surname','family name','lname'],
  notes:           ['notes','note','comments','comment','description','details','info'],
  status:          ['status','lead status','stage'],
  company_context: ['context','company_context','about','summary','bio','description'],
};

function autoDetectMapping(headers: string[]): Record<string, number> {
  const mapping: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i].toLowerCase().trim();
      if (aliases.includes(h)) {
        mapping[field] = i;
        break;
      }
    }
  }
  return mapping;
}

// ─── PUT — return auto-detected mapping ──────────────────────────────────────

export async function PUT(req: NextRequest) {
  const { headers } = await req.json() as { headers: string[] };
  const mapping = autoDetectMapping(headers);
  return NextResponse.json({ mapping });
}

// ─── POST — import CSV ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const mappingRaw = formData.get('mapping') as string | null;

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const text = await file.text();
  const { headers, rows } = parseCSV(text);

  if (rows.length === 0) {
    return NextResponse.json({ error: 'CSV is empty or has no data rows' }, { status: 400 });
  }

  // Parse mapping — either from client or auto-detect
  let mapping: Record<string, number> = mappingRaw ? JSON.parse(mappingRaw) : {};
  if (Object.keys(mapping).length === 0) {
    mapping = autoDetectMapping(headers);
  }

  // Validate we have at least company_name or email
  const hasCompany = mapping.company_name !== undefined;
  const hasEmail = mapping.email !== undefined;
  if (!hasCompany && !hasEmail) {
    return NextResponse.json({
      error: 'Could not detect company name or email columns. Please map them manually.',
    }, { status: 400 });
  }

  // Process all rows
  const get = (row: string[], field: string): string => {
    const idx = mapping[field];
    return idx !== undefined ? (row[idx] ?? '').trim() : '';
  };

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  let imported = 0;
  let duplicates = 0;
  let failed = 0;
  const errors: Array<{ row: number; error: string }> = [];

  // Process in chunks of 100
  const CHUNK = 100;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);

    const normalized = chunk.map((row, j) => {
      const rowNum = i + j + 2; // +2 for header row + 1-indexed
      const companyName = get(row, 'company_name') ||
        `${get(row, 'first_name')} ${get(row, 'last_name')}`.trim() ||
        get(row, 'email').split('@')[0];
      const email = get(row, 'email').toLowerCase();

      if (!companyName) {
        errors.push({ row: rowNum, error: 'Missing company name' });
        return null;
      }
      if (!email || !emailRegex.test(email)) {
        errors.push({ row: rowNum, error: `Invalid email: "${email}"` });
        return null;
      }

      // Build full name from first + last if available
      const firstName = get(row, 'first_name');
      const lastName = get(row, 'last_name');
      const fullName = [firstName, lastName].filter(Boolean).join(' ');

      return {
        user_id: user.id,
        company_name: companyName,
        email,
        phone: get(row, 'phone') || null,
        website: get(row, 'website') || null,
        niche: get(row, 'niche') || 'Imported',
        location: get(row, 'location') || null,
        company_context: get(row, 'company_context') ||
          (fullName ? `Contact: ${fullName}` : null),
        notes: get(row, 'notes') || null,
        status: get(row, 'status') || 'new',
        source: 'csv_import',
        confidence_score: 70,
        email_verified: false,
      };
    }).filter(Boolean) as any[];

    if (normalized.length === 0) {
      failed += chunk.length;
      continue;
    }

    // Deduplication
    const emails = normalized.map((r: any) => r.email);
    const { data: existing } = await supabase
      .from('leads')
      .select('email')
      .eq('user_id', user.id)
      .in('email', emails);

    const existingSet = new Set((existing ?? []).map((r: any) => r.email.toLowerCase()));
    const newLeads = normalized.filter((r: any) => !existingSet.has(r.email));
    duplicates += normalized.length - newLeads.length;

    if (newLeads.length > 0) {
      const { error: insertError } = await supabase.from('leads').insert(newLeads);
      if (insertError) {
        errors.push({ row: i + 2, error: insertError.message });
        failed += newLeads.length;
      } else {
        imported += newLeads.length;
      }
    }
  }

  return NextResponse.json({
    success: true,
    imported,
    duplicates,
    failed,
    errors: errors.slice(0, 50), // cap error list
    total: rows.length,
  });
}
