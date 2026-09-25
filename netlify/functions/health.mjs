export default async () => {
  return new Response(JSON.stringify({
    status: 'ok',
    provider: 'deepseek',
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    hasDeepSeekKey: Boolean(process.env.DEEPSEEK_API_KEY),
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
