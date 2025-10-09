# チャンク分割文字起こし処理のトラブルシューティング

## 問題の概要
チャンク分割されたファイルをCloudにアップロードした後、文字起こしを始めるボタンを押した後の処理が失敗する問題。

## 主な確認ポイント

### 1. 環境変数の設定確認

#### 必須環境変数のチェック
`.env.local`ファイルに以下の環境変数が正しく設定されているか確認してください：

```bash
# Google Cloud関連
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GCS_BUCKET_NAME=darwin-project-audio-files
GOOGLE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY_ID=your-private-key-id
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n"
GOOGLE_CLIENT_ID=your-client-id

# Redis（状態管理用）
KV_REST_API_URL=https://your-redis-url.upstash.io
KV_REST_API_TOKEN=your-redis-token-here
```

#### GOOGLE_PRIVATE_KEYの注意点
- **必ずダブルクォート（`"`）で囲む**
- 改行は`\n`としてエスケープする
- 実際の秘密鍵の内容を1行で記述

❌ 間違った例：
```bash
GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...
-----END PRIVATE KEY-----
```

✅ 正しい例：
```bash
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
```

### 2. Google Cloud Storageバケットの確認

#### バケット名の一致
- 環境変数`GCS_BUCKET_NAME`とGoogle Cloud Consoleで作成したバケット名が一致しているか
- デフォルト値は`darwin-project-audio-files`

#### バケットの権限
- サービスアカウントに以下の権限が付与されているか確認：
  - `Storage Object Creator`（アップロード用）
  - `Storage Object Viewer`（読み取り用）
  - `Storage Object Admin`（推奨）

### 3. Cloud Runの確認

#### Cloud RUN URLの検証
フロントエンド（`src/app/chunked-transcribe/page.tsx`）で指定されているCloud Run URL：
```typescript
const CLOUD_RUN_URL = 'https://darwin-project-574364248563.asia-northeast1.run.app';
```

**確認事項：**
1. このURLが正しく稼働しているか
2. `/api/transcribe-chunks`エンドポイントが存在するか
3. CORS設定が正しいか
4. 認証が不要（または正しく設定されている）か

#### 簡易テスト
```bash
curl -X POST https://darwin-project-574364248563.asia-northeast1.run.app/api/transcribe-chunks \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test_user",
    "sessionId": "test_session",
    "chunks": []
  }'
```

### 4. ローカルAPI vs Cloud Run API

現在のコードでは、**統合文字起こし**と**個別ファイル文字起こし**で異なるAPIを呼び出しています：

#### 統合文字起こし（複数ファイル）
```typescript
// src/app/chunked-transcribe/page.tsx:245
const CLOUD_RUN_URL = 'https://darwin-project-574364248563.asia-northeast1.run.app';
fetch(`${CLOUD_RUN_URL}/api/transcribe-chunks`, { ... })
```

#### 個別ファイル文字起こし
```typescript
// src/app/chunked-transcribe/page.tsx:513
fetch('/api/transcribe-chunks', { ... })  // ローカルAPI
```

**問題の可能性：**
- Cloud Runに`/api/transcribe-chunks`エンドポイントがデプロイされていない
- ローカル環境とCloud Runで実装が異なる

### 5. デバッグ手順

#### ステップ1: 環境変数の確認
```bash
# プロジェクトディレクトリで実行
cat .env.local | grep -E "(GOOGLE_|GCS_|KV_)"
```

#### ステップ2: ローカルサーバーのログ確認
```bash
npm run dev
```
ブラウザのコンソールとターミナルのログを確認してください。

#### ステップ3: 署名付きURL生成APIのテスト
```bash
curl -X POST http://localhost:3000/api/cloud-storage/signed-url \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test_user",
    "sessionId": "test_session",
    "chunkId": "chunk_0",
    "operation": "upload"
  }'
```

#### ステップ4: アップロード済みファイルの確認
Google Cloud Consoleでバケットを確認：
```
darwin-project-audio-files/
└── users/
    └── user_xxxxx/
        └── sessions/
            └── session_xxxxx/
                └── chunks/
                    ├── segment_001_chunk_0.wav
                    ├── segment_001_chunk_1.wav
                    └── ...
```

### 6. よくあるエラーと対処法

#### エラー1: "GOOGLE_PRIVATE_KEY is not set"
- `.env.local`に`GOOGLE_PRIVATE_KEY`が設定されているか確認
- Next.jsを再起動（`npm run dev`を停止して再実行）

#### エラー2: "Failed to get signed URL"
- サービスアカウントの秘密鍵が正しいか確認
- 改行文字が正しくエスケープされているか確認

#### エラー3: "ファイルが見つかりません"
- バケット名が正しいか確認
- `cloudPath`が正しく設定されているか確認
- ファイルが実際にアップロードされたか確認

#### エラー4: "文字起こしAPI呼び出しに失敗しました"
- Cloud Run URLが正しいか確認
- Cloud Runサービスが稼働しているか確認
- CORS設定を確認

#### エラー5: "アップロード済みのチャンクが見つかりません"
- `fileProcessingStates`が正しく更新されているか確認
- `uploadResults`が正しく保存されているか確認

## 推奨される修正方法

### オプション1: ローカルAPIを使用する（推奨）
Cloud Runではなく、ローカルのNext.js APIを使用するように変更：

```typescript
// src/app/chunked-transcribe/page.tsx:260
// 変更前
const transcriptionResponse = await fetch(`${CLOUD_RUN_URL}/api/transcribe-chunks`, {
  // ...
});

// 変更後
const transcriptionResponse = await fetch('/api/transcribe-chunks', {
  // ...
});
```

### オプション2: Cloud Run URLを環境変数化
ハードコードされたURLを環境変数に移動：

```typescript
// src/app/chunked-transcribe/page.tsx
const CLOUD_RUN_URL = process.env.NEXT_PUBLIC_CLOUD_RUN_URL || '';
```

`.env.local`に追加：
```bash
NEXT_PUBLIC_CLOUD_RUN_URL=https://darwin-project-574364248563.asia-northeast1.run.app
```

## チェックリスト

- [ ] `.env.local`ファイルが存在する
- [ ] 全ての必須環境変数が設定されている
- [ ] `GOOGLE_PRIVATE_KEY`がダブルクォートで囲まれている
- [ ] Google Cloud Storageバケットが存在する
- [ ] サービスアカウントに適切な権限がある
- [ ] Next.jsサーバーを再起動した
- [ ] ブラウザのコンソールでエラーを確認した
- [ ] Cloud Run URLが正しい（または使用しない）
- [ ] Redis（Upstash）が設定されている

## 次のステップ

1. 上記のチェックリストを確認
2. 環境変数を修正した場合は、Next.jsを再起動
3. ブラウザを再読み込みして再テスト
4. エラーが続く場合は、ブラウザのコンソールとサーバーログを確認
5. 具体的なエラーメッセージを記録して、さらなるデバッグを行う

