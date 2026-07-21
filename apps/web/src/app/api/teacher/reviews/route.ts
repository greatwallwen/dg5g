import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request) {
  return NextResponse.json({
    error: 'REVIEW_ENDPOINT_RETIRED',
    message: '旧批阅接口已停用，请从任务成果队列发起批阅。',
    replacement: '/api/teacher/outputs/{outputId}/reviews',
  }, { status: 410 });
}
