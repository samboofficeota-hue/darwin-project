# チャンク文字起こし処理の修正ガイド

## 実施した修正

### ✅ 1. APIエンドポイントの変更
**ファイル:** `src/app/chunked-transcribe/page.tsx`

**変更内容:**
- Cloud Run URLから**ローカルAPI**に変更
- これにより、ローカル環境で完結する処理に修正しました

```typescript
// 変更前
const CLOUD_RUN_URL = 'https://darwin-project-574364248563.asia-northeast1.run.app';
fetch(`${CLOUD_RUN_URL}/api/transcribe-chunks`, { ... })

// 変更後
fetch('/api/transcribe-chunks', { ... })
```

## 次に行うべき作業

### 1. 環境変数の設定確認

`.env.local`ファイルに以下の環境変数が設定されているか確認してください：

```bash
# Redis (Upstash) - 状態管理用
KV_REST_API_URL=https://large-magpie-6493.upstash.io
KV_REST_API_TOKEN=ARIdAAlmcDlzMTM4Y2U1MTY4ZWY0NzI1YTZjZl

# Google Cloud Storage
GCS_BUCKET_NAME=darwin-project-audio-files

# Google Cloud Project
GOOGLE_CLOUD_PROJECT_ID=whgc-project
GOOGLE_CLIENT_EMAIL=darwin-project@whgc-project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY_ID=0a18c63f73f012d202eead4b201b370fe0650c4b
GOOGLE_CLIENT_ID=109914435144619722632
```

### 2. GOOGLE_PRIVATE_KEYの設定

**最も重要な設定です！**

Cloud Runの環境変数から`GOOGLE_PRIVATE_KEY`の完全な値をコピーして、`.env.local`に以下の形式で追加してください：

```bash
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhki...[完全な秘密鍵]...\n-----END PRIVATE KEY-----\n"
```

**注意点：**
- 必ず**ダブルクォート（`"`）で囲む**
- 改行は`\n`で表現する
- 1行で記述する

### 3. Next.jsサーバーの再起動

```bash
# 現在のサーバーを停止（Ctrl+C）
# その後、再起動
npm run dev
```

### 4. 動作確認

1. ブラウザで `http://localhost:3000/chunked-transcribe` にアクセス
2. 音声ファイルを選択
3. 「クラウドへ送る」をクリック
4. アップロード完了後、「文字起こしスタート」をクリック
5. エラーが出ないことを確認

## トラブルシューティング

### エラー: "GOOGLE_PRIVATE_KEY is not set"

**原因:** 環境変数が正しく設定されていない

**対処法:**
1. `.env.local`ファイルに`GOOGLE_PRIVATE_KEY`を追加
2. ダブルクォートで囲まれているか確認
3. Next.jsサーバーを再起動

### エラー: "Failed to get signed URL"

**原因:** 秘密鍵のフォーマットが間違っている

**対処法:**
1. `GOOGLE_PRIVATE_KEY`の値を確認
2. 改行が`\n`でエスケープされているか確認
3. Cloud Runの環境変数と完全に一致しているか確認

### エラー: "ファイルが見つかりません"

**原因:** バケット名が間違っている

**対処法:**
1. `GCS_BUCKET_NAME=darwin-project-audio-files`が設定されているか確認
2. Google Cloud Consoleでバケットが存在するか確認

### エラー: "文字起こしAPI呼び出しに失敗しました"

**原因:** ローカルAPIが正しく動作していない

**対処法:**
1. ブラウザのコンソールでエラー詳細を確認
2. サーバーのターミナルでエラーログを確認
3. `/api/transcribe-chunks`エンドポイントが存在するか確認

## 確認チェックリスト

- [ ] `.env.local`ファイルに全ての環境変数を設定した
- [ ] `GOOGLE_PRIVATE_KEY`をダブルクォートで囲んだ
- [ ] Next.jsサーバーを再起動した
- [ ] ブラウザで動作確認した
- [ ] エラーが解消された

## 追加情報

### 環境変数の確認コマンド

```bash
# 環境変数の名前だけを確認（値は表示されない）
grep -E "^[A-Z]" .env.local | cut -d'=' -f1
```

期待される出力：
```
KV_REST_API_URL
KV_REST_API_TOKEN
GCS_BUCKET_NAME
GOOGLE_CLOUD_PROJECT_ID
GOOGLE_CLIENT_EMAIL
GOOGLE_PRIVATE_KEY_ID
GOOGLE_PRIVATE_KEY
GOOGLE_CLIENT_ID
```

### Google Cloud Storageの確認

バケット内のファイルを確認：
```bash
gsutil ls gs://darwin-project-audio-files/users/
```

## まとめ

この修正により、以下が改善されます：

1. ✅ ローカル環境で完結した処理
2. ✅ Cloud Runへの依存を削減
3. ✅ デバッグが容易に
4. ✅ より高速なレスポンス

問題が解決しない場合は、ブラウザのコンソールとサーバーログを確認して、具体的なエラーメッセージを確認してください。

