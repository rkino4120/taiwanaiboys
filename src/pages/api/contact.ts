import type { APIRoute } from 'astro';

// SSG（静的生成）プロジェクトの場合でも、このエンドポイントだけをサーバーサイド(SSR)で動かすための設定
export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();
    const { company, name, email, requestType, message } = data;

    // 1. サーバーサイド・バリデーション (セキュリティ & 不正防止)
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return new Response(JSON.stringify({ error: 'お名前は必須です。' }), { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return new Response(JSON.stringify({ error: '有効なメールアドレスを入力してください。' }), { status: 400 });
    }

    if (!requestType || typeof requestType !== 'string' || requestType.trim() === '') {
      return new Response(JSON.stringify({ error: 'お問合せ種別を選択してください。' }), { status: 400 });
    }

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return new Response(JSON.stringify({ error: 'ご依頼内容は必須です。' }), { status: 400 });
    }

    // 2. 外部API (Resend) を利用したメール送信処理
    // ※ 環境変数 RESEND_API_KEY をホスティング先（Vercel, Netlify, Cloudflare等）または .env に設定してください。
    const RESEND_API_KEY = import.meta.env.RESEND_API_KEY;
    
    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY is not defined in environment variables.');
      return new Response(
        JSON.stringify({ error: 'システム設定エラーが発生しました。時間を置いて再度お試しください。' }), 
        { status: 500 }
      );
    }

    // メールのHTML本文作成
    const emailHtml = `
      <h2>台湾AI男子 公式サイトからのお問合せ</h2>
      <p>以下の内容でお問合せを受け付けました。</p>
      <hr />
      <p><strong>団体名・企業名:</strong> ${company ? company : '（未入力）'}</p>
      <p><strong>お名前:</strong> ${name}</p>
      <p><strong>メールアドレス:</strong> ${email}</p>
      <p><strong>お問合せ種別:</strong> ${requestType}</p>
      <p><strong>ご依頼内容:</strong></p>
      <p style="white-space: pre-wrap;">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
    `;

    // 外部メール配信API (Resend) へのリクエスト
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        // 送信元：Resendでドメイン認証していない場合は 'onboarding@resend.dev' を使用
        // 独自ドメインを登録している場合は 'no-reply@yourdomain.com' などが推奨されます
        from: 'Taiwan AI Boys Contact <onboarding@resend.dev>',
        to: ['contact@liang-works.com'],
        subject: `【お問合せ】${name}様より - ${requestType}`,
        html: emailHtml,
        reply_to: email, // お問合せ者のメアドに返信できるように設定
      }),
    });

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      console.error('Resend API Error:', errorText);
      return new Response(
        JSON.stringify({ error: 'メール送信プロバイダーの処理中にエラーが発生しました。' }), 
        { status: 500 }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: 'お問合せが正常に送信されました。' }), 
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Contact Server Error:', error);
    return new Response(
      JSON.stringify({ error: '予期せぬエラーが発生しました。しばらく経ってからお試しください。' }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};