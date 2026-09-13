import { queryDb } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { prompt, hairProfile } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: true, message: 'Prompt is required' }, { status: 400 });
    }

    // Read active directives
    const activeDirectives = queryDb(`
      SELECT title, content, directive_type, priority
      FROM mya_master_directives
      WHERE is_active = 1
      ORDER BY priority DESC
    `);

    // Read active stylists
    const stylists = queryDb(`
      SELECT stylist_name, salon_name, city, state, specialties, booking_url
      FROM mya_recommended_stylists
      WHERE is_active = 1
    `);

    // Assemble context preview
    const assembledContext = {
      directivesCount: activeDirectives.length,
      activeDirectives: activeDirectives.map((d: any) => ({ title: d.title, snippet: d.content })),
      profileInjected: hairProfile || {
        hairType: '4C',
        porosity: 'Low',
        density: 'High',
        goals: ['Moisture Retention', 'Length Preservation'],
      },
      matchedStylists: stylists.filter((s: any) =>
        prompt.toLowerCase().includes('stylist') ||
        prompt.toLowerCase().includes('salon') ||
        prompt.toLowerCase().includes(s.city.toLowerCase()) ||
        s.specialties.toLowerCase().split(', ').some((sp: string) => prompt.toLowerCase().includes(sp.toLowerCase()))
      ),
    };

    return NextResponse.json({
      success: true,
      simulation: {
        userPrompt: prompt,
        assembledContext,
        status: 'DIRECTIVES_ACTIVE',
        message: 'Directives evaluated successfully in sandbox.',
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: true, message: error.message }, { status: 500 });
  }
}
