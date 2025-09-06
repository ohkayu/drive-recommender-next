# AGENT ガイドライン（drive-recommender-next）

このドキュメントは、このリポジトリで AI エージェント（Codex CLI）を安全かつ効率的に活用するための運用ルールです。最小変更で目的に到達し、既存スタイルと整合しながら確実に検証・説明することを重視します。

## 目的と原則
- 最小差分: 目的達成に必要な範囲のみを変更。無関連の修正は行わない。
- 一貫性: 既存のフレームワーク/スタイル（Next.js 15, React 19, TypeScript, Tailwind v4）に合わせる。
- 明瞭性: 作業前に短いプレアンブル、要所で簡潔な進捗共有、最後に分かりやすいサマリ。
- 検証優先: 変更後はビルド/リンタ等で可能な範囲を検証し、不確実性は明示。
- 安全性: 機微情報の流出や破壊的操作を避け、権限のある範囲でのみ操作。

## 環境とツール
- リポジトリ: Next.js App Router 構成（`src/app`）。
- スクリプト: `npm run dev | build | start | lint`
- 主な依存: `next@15`, `react@19`, `tailwindcss@4`, `eslint@9`, TypeScript 5
- 使用ツール（Codex CLI）:
  - shell: 調査・ビルド・実行（必要に応じて）。`rg` で検索、`sed -n` で部分表示。
  - apply_patch: 変更は必ずパッチで適用（直接編集は禁止）。
  - update_plan: 複数工程や曖昧さがある場合に短い TODO プランを共有。
- 権限/制約（想定）:
  - 書き込み: ワークスペース内のみ。
  - ネットワーク: 制限あり（外部取得やインストールは要承認）。
  - エスカレーション: 破壊的操作やネットワーク等は事前に理由を添えて承認を得る。

## 作業フロー
1) 目的確認: ユースケース/成功条件/非目標を簡潔に確認。
2) 調査: `rg` で関連ファイルを検索。必要最小限の `sed -n` で内容を読む。
3) 設計/計画: 複数工程の場合は `update_plan` で 3–6 ステップに要約。
4) 実装: `apply_patch` で変更。無関係なリファクタは避ける。
5) 検証: 可能なら `npm run lint`、`npm run build`。実行不可/未検証部分は明記。
6) ハンドオフ: 変更点・理由・影響・確認方法を簡潔に共有。次の一手を提案。

プレアンブル例（コマンド前/短文）:
- 「`package.json` を確認してスクリプトを把握します。」
- 「設定を更新したので関連 TSX をパッチします。」

進捗共有例（8–10語程度）:
- 「ルーティングを確認。これから API を実装。」

## コーディング規約（このリポジトリ特化）
- 言語/構成: TypeScript + Next.js App Router。Server Component が既定。クライアント側は `"use client"` を明示。
- ディレクトリ: ページは `src/app/<route>/page.tsx`、API は `src/app/<route>/route.ts`。
- スタイル: Tailwind v4（`@import "tailwindcss";`）。既存のトークン/クラス設計に合わせる。
- 設定: `next.config.ts` を尊重。不要な設定追加は避ける。
- ESLint: ルールに従い、警告/エラーを残さない（可能な範囲で）。
- 命名: 意味のある名前を使用。1文字変数は避ける。
- コメント: 必要最小限。説明が必要なロジックのみ簡潔に。
- ライセンス/ヘッダ: 追加/変更しない。

## 変更の原則
- 破壊的変更や構成刷新は要求がない限り避ける。
- 既存 API/ルーティング/型への影響は最小化し、影響がある場合は明確に記述。
- ドキュメント（この `AGENT.md` や `README.md`）は必要に応じて更新。
- 無関係な不具合の修正は提案に留め、実装は要望時に実施。

## 検証と動作確認
- Lint: `npm run lint`
- Build: `npm run build`（Turbopack）
- Dev: `npm run dev` を案内（ローカル実行は人間の操作で可）。
- 手動確認: `http://localhost:3000`。変更箇所（ページ/コンポーネント/ルート）の確認手順を提示。
- 失敗時: ログの要点と推定原因/切り分け案を簡潔に提示。

## セキュリティ/プライバシー
- 秘密情報（API キー等）は `.env.local` にのみ追加し、コミットしない（`.gitignore` 済）。
- 依存追加や外部通信は事前承認。理由と代替案を提示。
- 破壊的操作（`rm -rf` や `git reset` 等）はしない。必要時は明確な承認を取得。

### セキュリティ強化ルール（追加）

#### 秘密情報（API キー等）の保護
- 原則: 秘密情報は「サーバー環境変数」でのみ扱い、クライアントへ絶対に渡さない。`NEXT_PUBLIC_` プレフィックスは公開前提。
- Git 取り込み防止:
  - `.env*`, `*.pem`, 秘密鍵/証明書/サービスアカウント JSON はコミット禁止（`.gitignore` 維持）。
  - 文字列埋め込みを避け、必ず `process.env.*` を参照。
- 事前スキャン（手動）:
  - 直近差分: `git diff --cached | rg -n "(?i)(api[_-]?key|secret|token|passwd|password|^ghp_|sk_live|AIza|xoxb|-----BEGIN)"`
  - ワークツリー: `rg -n "(?i)(api[_-]?key|secret|token|passwd|password|^ghp_|sk_live|AIza|xoxb|-----BEGIN)" --hidden -g '!*node_modules/*'`
- 自動化（任意）: pre-commit フック例（`.git/hooks/pre-commit`）
  ```sh
  #!/usr/bin/env sh
  git diff --cached -U0 | rg -n "(?i)(api[_-]?key|secret|token|passwd|password|^ghp_|sk_live|AIza|xoxb|-----BEGIN)" && {
    echo "\n[SECURITY] 秘密情報らしき文字列が検出されました。コミットを中断します。" >&2
    exit 1
  }
  ```
- 万一流出時: 直ちにキーをローテーションし、履歴除去（`git filter-repo`/BFG）を検討。影響範囲と対処を README/AGENT に追記。

#### 実装セキュリティ・チェックリスト（レビュー時に必ず確認）
- 入力検証: 受け取るパラメータはスキーマで検証（例: Zod）。型だけでなく値域/形式も制約。
- 認証/認可: セッション/トークンの検証とリソースごとの権限チェックを API 入口で実施。早期 return。
- SQL インジェクション対策: 文字列連結でクエリを組み立てない。必ずプリペアドステートメント/パラメタライズを使用。
  - ORM 利用時もプレースホルダ API を使用。生 SQL はテンプレート文字列の連結禁止。
- XSS 対策: React の自動エスケープを活かし、`dangerouslySetInnerHTML` は原則禁止。必要時はサニタイズ（サーバー側）。
- CSRF 対策: Cookie ベースのセッションを使う POST/PUT/DELETE は CSRF トークン or `SameSite`=Lax/Strict を確認。
- エラーハンドリング/ログ: スタックトレースや秘密情報をクライアントへ返さない。ログにもトークン/個人情報は残さない（マスキング）。
- CORS: 必要最小の `origin` のみ許可。`*` と `credentials` の併用禁止。
- セキュリティヘッダ: `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Content-Security-Policy`（可能な範囲）を送出。
- レート制限/ボット対策: 認証無しエンドポイントはレート制限を検討。重要操作は二重送信対策。
- SSRF/パストラバーサル: 外部 URL をそのままフェッチ/ファイル参照に使わない。ホワイトリスト/正規化。

#### Next.js 特有の注意
- 変数露出: `NEXT_PUBLIC_` 以外はクライアントへバンドルされない設計にする。サーバー専用処理は Route Handler/Server Actions 側で実行。
- ヘッダ設定（例）: `next.config.ts` でセキュリティヘッダを一括付与。
  ```ts
  // next.config.ts（抜粋）
  const securityHeaders = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'no-referrer' },
    { key: 'Permissions-Policy', value: 'geolocation=(), microphone=()' },
    // 本番で適切な CSP を検討（必要なソースのみ許可）
    // { key: 'Content-Security-Policy', value: "default-src 'self'" },
  ]
  export default {
    async headers() {
      return [{ source: '/(.*)', headers: securityHeaders }]
    },
  }
  ```
- キャッシュ/機微データ: 機微レスポンスは `cache: 'no-store'` などでブラウザ/中間キャッシュに残さない。

#### 依存/サプライチェーン
- 依存は最小限にし、公式/信頼できるソースのみ採用。
- 定期的に `npm audit` を実施し、重大な脆弱性は優先修正（自動アップデートは慎重に）。

#### セキュリティ・セルフチェック（実行例）
- 危険 API 利用の痕跡: `rg -n "dangerouslySetInnerHTML|eval\(|new Function\(|child_process|fs\.(read|write)FileSync" src` 
- 生 SQL 連結の痕跡: `rg -n "SELECT|INSERT|UPDATE|DELETE" src | rg '\\$\{.*\}'`
- 露出しそうな変数名: `rg -n "(?i)(api[_-]?key|secret|token|passwd|password)" src` 

## 出力（最終メッセージ）スタイル
- 構成: 要点を箇条書き中心に簡潔に。冗長な説明は避ける。
- ファイル参照: クリック可能なパス + 先頭行番号を付与（例: `src/app/page.tsx:1`）。
- セクション例:
  - 変更概要（何を、なぜ）
  - 影響範囲（誰/どこに影響）
  - 確認方法（lint/build/dev、画面確認手順）
  - 次の提案（一番近い作業）
- 大きなファイル全文は貼らず、必要時のみ抜粋。

## よくある追加タスクの方針
- 新規ページ追加: `src/app/<route>/page.tsx` を作成し、デザインは既存クラスに揃える。
- API 追加: `src/app/api/<name>/route.ts` で `GET/POST` を実装し、型安全を確保。
- UI コンポーネント: 再利用を意識し、Props/型を明確化。`use client` が必要かを判断。
- スタイル: Tailwind のトークン/ユーティリティを優先。独自 CSS は最小限。
- 型/ユーティリティ: 影響範囲が広い共通化は慎重に。小さく始める。

---
このガイドは運用改善に合わせて更新します。改善提案があれば歓迎します。
