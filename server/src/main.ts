import { bot } from "./bot";
import { registerHandlers } from "./bot/handlers";

registerHandlers(bot);

bot.catch((err) => {
  console.error("Bot error", err);
});

bot.start();
