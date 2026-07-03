import { Keyboard } from "grammy"

export const keyboard = new Keyboard()
  .text("/status")
  .text("/new")
  .text("/reset")
  .text("/commit")
  .text("/list")
  .resized()
  .persistent()
