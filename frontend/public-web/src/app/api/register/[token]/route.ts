import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.nzt.app.br';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    const { token } = await params;
    
    try {
        const res = await fetch(`${API_URL}/api/public/company/${token}`, {
            headers: {
                'Accept': 'application/json',
                'Origin': request.headers.get('origin') || 'https://cadastro.nzt.app.br'
            }
        });
        
        const data = await res.json();
        
        return NextResponse.json(data, {
            status: res.ok ? 200 : res.status,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Accept'
            }
        });
    } catch (error: any) {
        return NextResponse.json(
            { error: error.message || 'Erro ao buscar dados' },
            { status: 500 }
        );
    }
}

export async function OPTIONS() {
    return new NextResponse(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Accept'
        }
    });
}