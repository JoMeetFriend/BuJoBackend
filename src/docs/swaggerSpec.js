import swaggerJsdoc from "swagger-jsdoc";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../package.json", import.meta.url)),
    "utf-8",
  ),
);

const PORT = process.env.PORT || 3000;

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.3",
    info: {
      title: "BuJo Backend API",
      version: pkg.version,
      description:
        "BuJo 後端 API 文件。所有需要登入的 API 均透過 httpOnly cookie（`token`）驗證，" +
        "前端不需手動帶 token header，但 fetch / axios 需設定 `credentials: 'include'`。",
    },
    servers: [
      { url: `http://localhost:${PORT}`, description: "本地開發" },
      { url: "https://api.bujo.live", description: "Production（main）" },
      {
        url: "https://bujobackend-bkef.onrender.com",
        description: "測試版本（dev）",
      },
    ],
    tags: [
      { name: "Auth", description: "註冊、登入、第三方登入（Google／LINE）" },
      { name: "Users", description: "使用者個人資料（頭像／名稱／簡介／搜尋）" },
      { name: "Friends", description: "好友列表" },
      { name: "Friendships", description: "好友邀請的發送／接受／拒絕／刪除" },
      { name: "Activities", description: "揪團活動（四種排程情境）" },
      { name: "Notifications", description: "站內通知" },
      { name: "Places", description: "地點自動完成" },
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "token",
          description: "登入後由伺服器設置的 httpOnly JWT cookie",
        },
      },
      schemas: {
        ErrorResponse: {
          type: "object",
          properties: {
            message: { type: "string", description: "錯誤說明" },
          },
        },
        PublicUser: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            display_name: { type: "string" },
            avatar_url: { type: "string", nullable: true },
          },
        },
        Friendship: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            requester_id: { type: "string", format: "uuid" },
            receiver_id: { type: "string", format: "uuid" },
            status: {
              type: "string",
              enum: ["pending", "accepted", "rejected", "deleted"],
            },
          },
        },
        Notification: {
          type: "object",
          description:
            "站內通知。`actor` 依 `type` 對應 friendship requester／receiver／activity creator，" +
            "查不到來源時固定為 `null`；activity 生命週期通知（formation_ready／time_to_pick／" +
            "activity_confirmed／activity_cancelled）固定回傳 `actor: null`。",
          properties: {
            id: { type: "string" },
            type: {
              type: "string",
              enum: [
                "friend_request_created",
                "friend_request_accepted",
                "activity_created",
                "formation_ready",
                "time_to_pick",
                "activity_confirmed",
                "activity_cancelled",
              ],
            },
            category: { type: "string", enum: ["friend", "activity"] },
            message: { type: "string" },
            timeText: { type: "string" },
            isRead: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
            actor: {
              type: "object",
              nullable: true,
              properties: {
                id: { type: "string" },
                displayName: { type: "string" },
                avatarUrl: { type: "string", nullable: true },
              },
            },
            reference: {
              type: "object",
              nullable: true,
              properties: {
                type: { type: "string", enum: ["friendship", "activity"] },
                id: { type: "string" },
                status: { type: "string" },
              },
            },
            actions: {
              type: "array",
              items: { type: "string", enum: ["accept", "reject"] },
            },
          },
        },
        Activity: {
          type: "object",
          additionalProperties: true,
          description:
            "揪團活動。實際回應形狀依 `schedule_variant` 而異（`fixed` / `find_time`（range 模式）/ " +
            "`find_date` / `find_date_time`），詳見 `GET /api/activities/{id}` 的說明；此 schema 僅列出跨情境共同欄位，" +
            "情境專屬欄位（`decision_candidates`、`candidate_slots[]`、`my_ranges[]` 等）刻意不用嚴格 oneOf 限制型別，" +
            "避免 schema 因情境分支而過度僵化。",
          properties: {
            id: { type: "string", format: "uuid" },
            title: { type: "string" },
            location: { type: "string", nullable: true },
            description: { type: "string", nullable: true },
            category: { type: "string", nullable: true },
            status: {
              type: "string",
              enum: ["recruiting", "voting", "confirmed", "cancelled"],
            },
            participant_target: { type: "integer", nullable: true },
            is_creator: { type: "boolean" },
            has_joined: { type: "boolean" },
            creator: { $ref: "#/components/schemas/PublicUser" },
            requires_voting: { type: "boolean" },
            availability_mode: { type: "string", enum: ["slot", "range"] },
            schedule_variant: {
              type: "string",
              enum: ["fixed", "find_time", "find_date", "find_date_time"],
            },
            deadline_at: {
              type: "string",
              format: "date-time",
              nullable: true,
              description:
                "決策硬截止天花板，伺服器依情境公式計算，不接受客戶端輸入",
            },
            vote_deadline_at: {
              type: "string",
              format: "date-time",
              nullable: true,
              description: "報名截止時間，由建立者的 `deadline` 欄位決定",
            },
            confirmed_slot: { type: "object", nullable: true },
            participants: {
              type: "array",
              items: { $ref: "#/components/schemas/PublicUser" },
            },
            current_count: { type: "integer" },
          },
        },
      },
    },
  },
  apis: ["./src/routes/*.js"],
});

export default swaggerSpec;
