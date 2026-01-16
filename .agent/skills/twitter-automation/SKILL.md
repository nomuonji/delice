---
name: Twitter Automation via RapidAPI
description: RapidAPI (twitter-api45) を使用したTwitterデータの収集、解析、およびAIを活用した自動エンゲージメントシステムの実装ガイド。
---

# Twitter Automation via RapidAPI

このスキルは、公式APIの代わりにRapidAPI (`twitter-api45.p.rapidapi.com`) を使用して、Twitter（X）のデータを効率的かつ安価に取得し、AI（Gemini等）と組み合わせて高度な自動化を実現するための知見をまとめたものです。

## 1. 基本設定

### RapidAPIのエンドポイント
- **Host**: `twitter-api45.p.rapidapi.com`
- **Authentication**: `x-rapidapi-key` ヘッダーを使用
- **主要機能**: 検索、タイムライン取得、トレンド取得、ツイート詳細

### 前提条件
- RapidAPIのアカウントとAPIキー
- Node.js環境（`axios` 推奨）
- AIモデル（Gemini, GPT等）のAPIキー（推奨）

## 2. 主要機能とコード例

### 2.1 ツイート検索 (`search.php`)
特定のキーワードでツイートを検索します。

```javascript
const axios = require('axios');

async function searchTweets(keyword, type = 'Latest') {
    const options = {
        method: 'GET',
        url: 'https://twitter-api45.p.rapidapi.com/search.php',
        params: {
            query: keyword,
            search_type: type, // 'Latest' or 'Top'
        },
        headers: {
            'x-rapidapi-key': process.env.RAPIDAPI_KEY,
            'x-rapidapi-host': 'twitter-api45.p.rapidapi.com',
        },
    };
    const response = await axios.request(options);
    return response.data; // .timeline または .tweets に配列が入る
}
```

### 2.2 ユーザータイムライン取得 (`timeline.php`)
特定ユーザーの最新ツイートを取得します。ターゲット戦略に必須です。

```javascript
async function getUserTimeline(screenName) {
    const options = {
        method: 'GET',
        url: 'https://twitter-api45.p.rapidapi.com/timeline.php',
        params: { screenname: screenName },
        headers: {
            'x-rapidapi-key': process.env.RAPIDAPI_KEY,
            'x-rapidapi-host': 'twitter-api45.p.rapidapi.com',
        },
    };
    const response = await axios.request(options);
    return response.data; // .timeline に配列が入る
}
```

### 2.3 トレンド取得 (`trends.php`)
特定の地域（日本など）のトレンドを取得します。

```javascript
async function getTrends(woeid = '23424856') { // 23424856 = Japan
    const options = {
        method: 'GET',
        url: 'https://twitter-api45.p.rapidapi.com/trends.php',
        params: { woeid: woeid },
        headers: {
            'x-rapidapi-key': process.env.RAPIDAPI_KEY,
            'x-rapidapi-host': 'twitter-api45.p.rapidapi.com',
        },
    };
    const response = await axios.request(options);
    return response.data.trends;
}
```

## 3. 推奨される運用戦略

### 戦略A: ターゲットリスト活用型（推奨）
**「質の高いアカウントを見つけてリスト化し、その発信に反応する」** 手法。トレンドに左右されず、常にターゲット層に刺さる運用が可能。

1.  **収集フェーズ (`--collect`)**:
    *   関連キーワード（例：「マッチングアプリ」「モテる」）で `search.php (search_type: Top)` を実行。
    *   フォロワー数（例：1000以上）などでフィルタリングし、良質なアカウントをDB/JSONに保存。
2.  **エンゲージメントフェーズ**:
    *   保存したリストからランダムにアカウントを選択。
    *   `timeline.php` で最新ツイートを取得。
    *   **24時間以内** の投稿に限定してフィルタリング（鮮度重視）。

### 戦略B: トレンド便乗型
**「今話題になっていることに触れる」** 手法。爆発力はあるが、ターゲット外の話題になりやすく、AIの判断が難しい。

1.  `trends.php` で日本のトレンドを取得。
2.  AIで「ターゲット層に関連付けられる話題か？」を厳しく判定。
3.  不適合なら無理に反応せず、フォールバックして戦略Aを実行する。

## 4. AI (Gemini) との連携

取得したツイートに対し、単なる定型文ではなく「文脈を理解した引用ツイート」を行うためにAIを使用します。

### プロンプト設計のポイント
1.  **役割定義**: 「SNSマーケティングの専門家」「友達のような口調」など。
2.  **適合性判断 (JSON出力)**:
    *   `isRelevant`: そのツイートに反応すべきか？（宣伝、ネガティブ、政治ネタは除外）
    *   `score`: 適合度。
3.  **コメント生成**:
    *   「ツイートの内容に具体的に触れること」を指示し、「参考になります」等のロボット的な返信を防ぐ。
    *   文字数制限（20-30字）と絵文字の使用を指示。

```javascript
// プロンプト例
const prompt = `
以下のツイートを評価し、JSON形式で回答してください。
投稿内容: ${tweet.text}

タスク:
1. ターゲット（20代男性）にとって有益か判断 (isRelevant)
2. 友達口調で20文字以内の引用コメントを生成 (comment)

出力例: {"isRelevant": true, "comment": "これマジわかるわw"}
`;
```

## 5. 自動化のポイント (GitHub Actions)

- **スケジュール実行**: `cron` を使用（例：JST 12:00, 21:00）。
- **Dry Runモード**: 実装時は必ず `--dry-run` フラグを作り、APIを叩かずにログだけ確認できるモードを用意する。
- **ステータス管理**: 同じツイートに何度も反応しないよう、`quotedTweetIds` などをJSONで永続化し、Gitにコミットする。
