import { Keyboard } from "grammy"

export const keyboard = new Keyboard()
  .text("/status")
  .text("/new")
  .text("/reset")
  .text("/commit")
  .resized()
  .persistent()
