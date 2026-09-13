import { queryDb, runDb } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  try {
    const stylists = queryDb(`
      SELECT id, stylist_name, salon_name, city, state, specialties, booking_url, instagram, is_verified_partner, is_active
      FROM mya_recommended_stylists
      ORDER BY is_verified_partner DESC, stylist_name ASC
    `);
    return NextResponse.json({ success: true, stylists });
  } catch (error: any) {
    return NextResponse.json({ error: true, message: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { stylist_name, salon_name = '', city, state = '', specialties = '', booking_url = '', instagram = '' } = body;

    if (!stylist_name || !city) {
      return NextResponse.json({ error: true, message: 'Stylist name and city are required' }, { status: 400 });
    }

    const safeName = String(stylist_name).replace(/'/g, "''");
    const safeSalon = String(salon_name).replace(/'/g, "''");
    const safeCity = String(city).replace(/'/g, "''");
    const safeState = String(state).replace(/'/g, "''");
    const safeSpecs = String(specialties).replace(/'/g, "''");
    const safeBooking = String(booking_url).replace(/'/g, "''");
    const safeInsta = String(instagram).replace(/'/g, "''");

    const inserted = runDb(`
      INSERT INTO mya_recommended_stylists (stylist_name, salon_name, city, state, specialties, booking_url, instagram, is_verified_partner, is_active)
      VALUES ('${safeName}', '${safeSalon}', '${safeCity}', '${safeState}', '${safeSpecs}', '${safeBooking}', '${safeInsta}', 1, 1);
    `);

    if (!inserted) {
      return NextResponse.json({ error: true, message: 'Insert failed' }, { status: 500 });
    }

    const created = queryDb(`SELECT * FROM mya_recommended_stylists ORDER BY id DESC LIMIT 1`);
    return NextResponse.json({ success: true, stylist: created[0], message: 'Stylist partner added and live in Mya knowledge base.' }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: true, message: error.message }, { status: 500 });
  }
}
