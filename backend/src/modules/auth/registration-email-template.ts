import { fileURLToPath } from 'node:url';

const subject = 'Xác nhận tài khoản StoryCraft';
const action = 'Xác nhận tài khoản';
const instruction = 'Mở link bằng trình duyệt bạn đã dùng để đăng ký StoryCraft.';
const fallback = 'Nếu không mở được link, hãy chọn Dùng mã 8 số ở tab đăng ký.';
const ignore = 'Nếu bạn không yêu cầu tạo tài khoản, bạn có thể bỏ qua email này.';

function inlineImage(filename: string) {
  return {
    filename,
    path: fileURLToPath(new URL(`../../../assets/email/${filename}`, import.meta.url)),
    cid: `${filename}@storycraft`,
    contentType: 'image/png'
  };
}

const book = inlineImage('storycraft-book.png');
const wave = inlineImage('storycraft-wave.png');

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function createRegistrationEmail(code: string, confirmationUrl: string, expiresInMinutes: number) {
  const expiry = `Link và mã có hiệu lực trong ${expiresInMinutes} phút.`;
  const text = `${subject}\n\n${confirmationUrl}\n${instruction}\n\n${fallback}\nMã dự phòng là ${code}.\n\n${expiry}\n${ignore}`;

  // Inline the base styles so the email retains its layout in clients that strip <style>.
  const html = `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>${subject}</title>
  <style>
    @media screen and (max-width: 480px) {
      .sc-email-frame { padding: 16px 8px !important; }
      .sc-email-wave { margin-top: -11px !important; }
      .sc-email-content { padding: 14px 20px 24px !important; }
      .sc-email-title { font-size: 24px !important; line-height: 30px !important; }
      .sc-email-button-table { width: 100% !important; }
      .sc-email-code { font-size: 26px !important; letter-spacing: 0.22em !important; }
    }
    @media (prefers-color-scheme: dark) {
      .sc-email-canvas { background-color: #171715 !important; }
      .sc-email-card { border-color: #654a3d !important; box-shadow: none !important; }
      .sc-email-header { padding-bottom: 18px !important; background-color: #423026 !important; color: #f0ae95 !important; }
      .sc-email-wave { display: none !important; }
      .sc-email-content { background-color: #24221f !important; color: #f2efea !important; }
      .sc-email-muted { color: #bdb6ad !important; }
      .sc-email-rule { border-color: #654a3d !important; }
      .sc-email-label { background-color: #423026 !important; color: #f0ae95 !important; }
      .sc-email-code { background-color: #423026 !important; border-color: #654a3d !important; color: #f0ae95 !important; }
      .sc-email-footer { background-color: #2c2926 !important; border-color: #45403a !important; color: #bdb6ad !important; }
    }
  </style>
</head>
<body class="sc-email-canvas" style="margin:0;padding:0;background-color:#fbf3eb;">
  <div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;" aria-hidden="true">
    Hoàn tất đăng ký StoryCraft trong ${expiresInMinutes} phút.
  </div>
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" class="sc-email-canvas" style="background-color:#fbf3eb;">
    <tr>
      <td align="center" class="sc-email-frame" style="padding:20px 16px 28px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" class="sc-email-card" style="max-width:600px;border:1px solid #dfbda6;border-radius:18px;box-shadow:0 9px 24px rgba(119,54,35,0.14);font-family:'Be Vietnam Pro',Arial,sans-serif;">
          <tr>
            <td align="center" class="sc-email-header" style="padding:14px 0 0;background-color:#faede2;border-radius:17px 17px 0 0;color:#4b2015;">
              <img src="cid:${book.cid}" alt="" width="100" height="32" style="display:block;margin:0 auto 2px;border:0;">
              <p style="margin:0;font-size:27px;line-height:32px;font-weight:800;letter-spacing:0.3px;">StoryCraft</p>
              <img src="cid:${wave.cid}" alt="" width="598" class="sc-email-wave" style="display:block;width:100%;max-width:598px;height:auto;margin:-32px 0 0;border:0;">
            </td>
          </tr>
          <tr>
            <td align="center" class="sc-email-content" style="padding:15px 39px 27px;background-color:#fcf8f3;color:#4b2015;">
              <h1 class="sc-email-title" style="margin:0 0 8px;font-size:30px;line-height:38px;font-weight:800;">Xác nhận email của bạn</h1>
              <p class="sc-email-muted" style="margin:0 0 21px;color:#633f32;font-size:15px;line-height:23px;">${instruction}</p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="83%" align="center" class="sc-email-button-table">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(confirmationUrl)}" class="sc-email-action" style="display:block;padding:11px 14px;background-color:#a64025;background-image:linear-gradient(180deg,#ae4628,#a13b23);border:1px solid #a64025;border-radius:14px;box-shadow:0 5px 12px rgba(166,64,37,0.18);color:#fff7ee;font-size:18px;line-height:23px;font-weight:700;text-decoration:none;">
                      ${action}<span aria-hidden="true">&nbsp; &rarr;</span>
                    </a>
                  </td>
                </tr>
              </table>
              <p class="sc-email-muted" style="margin:10px 0 22px;color:#633f32;font-size:14px;line-height:21px;">${expiry}</p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" class="sc-email-rule" style="border-top:1px solid #e5c7b3;">
                <tr>
                  <td align="center" style="padding:14px 10px 0;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="94%" style="margin:0 auto 12px;">
                      <tr>
                        <td width="50%" valign="middle"><div class="sc-email-rule" style="border-top:1px solid #dfbda6;"></div></td>
                        <td align="center" style="padding:0 10px;">
                          <h2 class="sc-email-label" style="margin:0;padding:5px 15px;background-color:#fae8db;border-radius:18px;color:#4b2015;font-size:17px;line-height:21px;font-weight:800;white-space:nowrap;">Mã dự phòng</h2>
                        </td>
                        <td width="50%" valign="middle"><div class="sc-email-rule" style="border-top:1px solid #dfbda6;"></div></td>
                      </tr>
                    </table>
                    <p class="sc-email-muted" style="margin:0 0 15px;color:#633f32;font-size:14px;line-height:21px;">${fallback}</p>
                    <div dir="ltr" class="sc-email-code" style="padding:8px 5px;background-color:#fff0e4;border:1px solid #e6a382;border-radius:12px;color:#8e3019;font-size:31px;line-height:37px;font-weight:800;letter-spacing:0.23em;white-space:nowrap;">${escapeHtml(code)}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" class="sc-email-footer" style="padding:14px 22px 17px;background-color:#f8eadd;border-top:1px solid #fff7ef;border-radius:0 0 17px 17px;color:#633f32;font-size:14px;line-height:21px;">
              ${ignore}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  return { subject, text, html, attachments: [book, wave] };
}
