import { describe, expect, test } from "bun:test"
import { toChatId, toIntlDigits } from "../src/lib/phone"

describe("phone normalization", () => {
  test("adds the selected country code to a local number", () => {
    expect(toIntlDigits("GH", "0509981202")).toBe("233509981202")
  })

  test("does not duplicate a country code that is already present", () => {
    expect(toIntlDigits("GH", "233509981202")).toBe("233509981202")
    expect(toChatId("GH", "233509981202")).toBe("233509981202@c.us")
  })

  test("keeps an explicit international prefix", () => {
    expect(toIntlDigits("GH", "+233 50 998 1202")).toBe("233509981202")
    expect(toIntlDigits("GH", "00233509981202")).toBe("233509981202")
  })

  test("passes chat ids and usernames through", () => {
    expect(toChatId("GH", "233509981202@c.us")).toBe("233509981202@c.us")
    expect(toChatId("GH", "@support")).toBe("@support")
  })
})
