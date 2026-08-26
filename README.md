# gsmsv CLI

GSM SV 플랫폼(VM · 서버리스 함수)을 터미널에서 관리하는 CLI 입니다. `vercel` CLI 와 비슷한 사용감을 목표로 합니다.

- **의존성 0** — Node 20+ 의 내장 `fetch` / `util.parseArgs` 만 사용. 빌드 단계 없음.
- 백엔드의 `Authorization: Bearer` 인증을 사용하며, access token 만료 시 refresh token 으로 자동 갱신합니다.
- 자격증명은 `~/.gsmsv/auth.json` (권한 600) 에 저장됩니다.

## 설치

```bash
cd cli
npm link        # 전역에 gsmsv / gsm 명령 등록
# 또는 설치 없이 직접 실행
node src/index.js <명령>
```

## 시작하기

```bash
gsmsv login                         # 이메일/비밀번호 입력
gsmsv login --email me@gsm.hs.kr --role project_owner
gsmsv login --email me@gsm.hs.kr --datagsm
gsmsv whoami
```

기본 백엔드는 `https://gsmsv.site` 입니다. 로컬 개발 백엔드로 바꾸려면:

```bash
gsmsv config set api http://localhost:8000
# 또는 한 번만:  gsmsv --api http://localhost:8000 vm ls
# 또는 환경변수: GSMSV_API_URL=http://localhost:8000 gsmsv vm ls
```

## VM

```bash
gsmsv vm ls                         # 내 VM 목록
gsmsv vm inspect 105                # 상세 + 접속 정보 (IP, 비밀번호)
gsmsv vm start 105
gsmsv vm stop 105
gsmsv vm reboot 105
gsmsv vm create --tier small --os ubuntu2204 --name my-server
gsmsv vm rm 105 --yes

# 스냅샷
gsmsv vm snapshot ls 105
gsmsv vm snapshot create 105 before-deploy --desc "배포 전 백업"
gsmsv vm snapshot rollback 105 before-deploy
gsmsv vm snapshot rm 105 before-deploy
```

> VM 명령은 `vmid` 만 주면 CLI 가 `my-vms` 에서 노드를 자동으로 찾아냅니다.

## 서버리스 함수

```bash
gsmsv fn ls
gsmsv fn deploy index.js            # 이름이 같으면 갱신, 없으면 신규 (idempotent)
gsmsv fn exec my-fn --data '{"hello":"world"}'
gsmsv fn logs my-fn --limit 30
gsmsv fn inspect my-fn
gsmsv fn rm my-fn --yes
```

`id` 자리에는 함수 ID 전체/앞 8자리/이름 중 아무거나 쓸 수 있습니다.

### gsmsv.json (프로젝트 설정)

함수 폴더에 `gsmsv.json` 을 두면 `gsmsv fn deploy` 만으로 배포됩니다:

```json
{
  "name": "my-fn",
  "entry": "index.js",
  "runtime": "javascript",
  "timeout": 10000,
  "memoryLimit": 128,
  "description": "예시 함수",
  "env": { "API_KEY": "..." }
}
```

`examples/hello-fn/` 에 동작하는 예제가 있습니다.

## 전역 옵션

| 옵션 | 설명 |
| --- | --- |
| `--json` | 결과를 JSON 으로 출력 (스크립트/파이프용) |
| `--api <url>` | 이번 실행에만 백엔드 주소 지정 |
| `-y, --yes` | 확인 프롬프트 자동 승인 |
| `-h, --help` | 도움말 |
| `-v, --version` | 버전 |
