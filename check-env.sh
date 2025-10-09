#!/bin/bash

echo "=== 環境変数チェックツール ==="
echo ""
echo "ローカル環境をチェックしています..."
echo ""

# ローカルAPIをチェック
echo "📝 ローカル環境のチェック:"
curl -s http://localhost:3000/api/check-env | jq '.' || echo "❌ ローカルサーバーが起動していません。npm run dev を実行してください。"

echo ""
echo "=================================="
echo ""

# Cloud Runをチェック
echo "☁️  Cloud Run環境のチェック:"
curl -s https://darwin-project-574364248563.asia-northeast1.run.app/api/check-env | jq '.' || echo "❌ Cloud Runに接続できません。"

echo ""
echo "=================================="
echo ""
echo "✅ チェック完了"
echo ""
echo "注意事項:"
echo "- overallStatus が 'ok' であれば正常です"
echo "- 'error' の場合は、該当する環境変数を確認してください"
echo "- 'warning' の場合は、動作するかもしれませんが推奨設定ではありません"

