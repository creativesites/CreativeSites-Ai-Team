import { queryDb, runDb } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  try {
    const directives = queryDb(`
      SELECT id, title, directive_type, content, priority, is_active, created_by, created_at, updated_at
      FROM mya_master_directives
      ORDER BY priority DESC, id DESC
    `);
    return NextResponse.json({ success: true, directives });
  } catch (error: any) {
    return NextResponse.json({ error: true, message: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, content, directive_type = 'master_directive', priority = 100 } = body;

    if (!title || !content) {
      return NextResponse.json({ error: true, message: 'Title and content are required' }, { status: 400 });
    }

    const safeTitle = String(title).replace(/'/g, "''");
    const safeContent = String(content).replace(/'/g, "''");
    const safeType = String(directive_type).replace(/'/g, "''");
    const safePriority = Number(priority) || 100;

    const inserted = runDb(`
      INSERT INTO mya_master_directives (title, content, directive_type, priority, is_active, created_by, updated_at)
      VALUES ('${safeTitle}', '${safeContent}', '${safeType}', ${safePriority}, 1, 'Candace Mitchell', datetime('now'));
    `);

    if (!inserted) {
      return NextResponse.json({ error: true, message: 'Database insert failed' }, { status: 500 });
    }

    const created = queryDb(`SELECT * FROM mya_master_directives ORDER BY id DESC LIMIT 1`);
    return NextResponse.json({ success: true, directive: created[0], message: 'Master directive saved and live.' }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: true, message: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, is_active, content, priority } = body;

    if (!id) {
      return NextResponse.json({ error: true, message: 'id is required' }, { status: 400 });
    }

    const updates: string[] = ["updated_at = datetime('now')"];
    if (typeof is_active === 'boolean' || typeof is_active === 'number') {
      updates.push(`is_active = ${is_active ? 1 : 0}`);
    }
    if (content) {
      updates.push(`content = '${String(content).replace(/'/g, "''")}'`);
    }
    if (typeof priority === 'number') {
      updates.push(`priority = ${priority}`);
    }

    const updated = runDb(`
      UPDATE mya_master_directives SET ${updates.join(', ')} WHERE id = ${Number(id)};
    `);

    if (!updated) {
      return NextResponse.json({ error: true, message: 'Update failed' }, { status: 500 });
    }

    const record = queryDb(`SELECT * FROM mya_master_directives WHERE id = ${Number(id)}`);
    return NextResponse.json({ success: true, directive: record[0], message: 'Directive updated successfully.' });
  } catch (error: any) {
    return NextResponse.json({ error: true, message: error.message }, { status: 500 });
  }
}
