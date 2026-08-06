import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";

dotenv.config();

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function main() {
  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 200,
    messages: [
      { role: "user", content: "Responde solo con: Motor de Ejecutabilidad conectado correctamente." },
    ],
  });

  console.log(response.content);
}

main();