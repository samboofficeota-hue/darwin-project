# Request Size Limit 問題の修正

## 🎯 問題

**エラー:**
```
Request payload size exceeds the limit: 10485760 bytes.
```

各音声チャンクが10MB（Google Cloud Speech APIの制限）を超えているため、
Base64エンコードしたデータをリクエストに含める方式では処理できません。

## ✅ 実施した修正

### 修正内容

**ファイル:** `pages/api/transcribe-chunks.js`

**変更前（256-285行目）:**
- Cloud Storageからファイルをダウンロード
- Base64エンコード
- `audio.content`としてSpeech APIに送信
- ❌ 10MBの制限に引っかかる

**変更後:**
- Cloud Storage URIを直接使用
- `audio.uri`としてSpeech APIに送信  
- ✅ サイズ制限なし（最大480分まで）

### 具体的な変更

```javascript
// 変更前
const [audioBuffer] = await file.download();
const audioBytes = audioBuffer.toString('base64');
const audio = {
  content: audioBytes,
};

// 変更後
const gcsUri = `gs://${BUCKET_NAME}/${chunk.cloudPath}`;
const audio = {
  uri: gcsUri,
};
```

## 🚀 デプロイ方法

### 方法1: gcloud CLIでデプロイ（推奨）

```bash
cd /Users/Yoshi/Desktop/CursorでWebアプリ開発/Darwin-project

# デプロイを実行（5-10分かかります）
gcloud run deploy darwin-project \
  --source . \
  --region asia-northeast1 \
  --quiet
```

### 方法2: Google Cloud Consoleでデプロイ

1. https://console.cloud.google.com/run にアクセス
2. `darwin-project` サービスを選択
3. 「新しいリビジョンを編集してデプロイ」をクリック
4. コードを更新
5. デプロイ

### 方法3: GitHub経由で自動デプロイ

```bash
# 変更をコミット
git add pages/api/transcribe-chunks.js
git commit -m "Fix: Use GCS URI instead of content for Speech API (avoid 10MB limit)"
git push origin main
```

GitHub Actionsが設定されている場合、自動的にデプロイされます。

## 🧪 デプロイ後の確認

### ステップ1: デプロイ完了を確認

```bash
# サービスの状態を確認
gcloud run services describe darwin-project \
  --region asia-northeast1 \
  --format="value(status.url,status.latestReadyRevisionName)"
```

### ステップ2: テスト文字起こし

1. **ブラウザでアクセス**
   ```
   http://localhost:3000/chunked-transcribe
   ```

2. **音声ファイルを選択**

3. **「クラウドへ送る」をクリック**

4. **「文字起こしスタート」をクリック**

5. **進捗を確認**

### ステップ3: エラーが解消されたことを確認

以前のエラー：
```
❌ Request payload size exceeds the limit: 10485760 bytes.
```

修正後：
```
✅ 処理が正常に進行
✅ 進捗が更新される
✅ 文字起こし結果が表示される
```

## 📊 修正による改善

### Before（修正前）

```
Cloud Storage → ダウンロード → Base64エンコード → Speech API
                ↓
               10MB制限
                ↓
               ❌ エラー
```

### After（修正後）

```
Cloud Storage URI → Speech API（直接読み取り）
                    ↓
                   480分まで対応
                    ↓
                   ✅ 成功
```

### 利点

1. ✅ **サイズ制限なし**: 10MBの制限を回避
2. ✅ **メモリ効率**: ファイルをダウンロードしないため、メモリ使用量が少ない
3. ✅ **処理速度**: ダウンロード時間が不要
4. ✅ **安定性**: 大きなファイルでも安定して処理

## 🔧 トラブルシューティング

### エラー: "Permission denied"

**原因:** Speech APIがCloud Storageにアクセスする権限がない

**対処法:**
```bash
# サービスアカウントにStorage Object Viewerロールを付与
gcloud projects add-iam-policy-binding whgc-project \
  --member="serviceAccount:darwin-project@whgc-project.iam.gserviceaccount.com" \
  --role="roles/storage.objectViewer"
```

### エラー: "Invalid sample rate"

**原因:** サンプルレートが正しくない

**対処法:**
音声ファイルが48000Hz以外の場合、`pages/api/transcribe-chunks.js`の285行目を修正：

```javascript
// 44100Hzの場合
sampleRateHertz: 44100,

// 16000Hzの場合
sampleRateHertz: 16000,
```

### デプロイがタイムアウトする

**原因:** ビルドに時間がかかりすぎている

**対処法:**
```bash
# タイムアウト時間を延長
gcloud run deploy darwin-project \
  --source . \
  --region asia-northeast1 \
  --timeout=3600 \
  --quiet
```

## 📝 次のステップ

1. **デプロイを実行**
   ```bash
   gcloud run deploy darwin-project --source . --region asia-northeast1 --quiet
   ```

2. **デプロイ完了を待つ（5-10分）**

3. **ブラウザで文字起こしをテスト**

4. **エラーが解消されたことを確認**

5. **正常に文字起こしが完了することを確認**

---

**修正日:** 2025-10-09
**ステータス:** 修正完了、デプロイ待ち
**優先度:** 高（必須）

