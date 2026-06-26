// GSM SV 서버리스 함수 예제.
// request 객체:
//   request.method  - HTTP 메서드
//   request.headers - 요청 헤더 객체
//   request.body    - 요청 바디 (문자열)
//   request.json()  - 바디를 JSON 으로 파싱
export default async function handler(request) {
  let payload = {};
  try {
    payload = await request.json();
  } catch {
    // 바디 없음/비JSON 은 무시
  }

  const name = payload.name || "World";

  return new Response(JSON.stringify({ message: `Hello, ${name}!`, at: Date.now() }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
