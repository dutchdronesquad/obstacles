// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: {
    rolldownOptions: {
      onLog(level, log, defaultHandler) {
        // This app runs entirely in the browser; these dependencies also support RSC.
        if (
          log.code === "MODULE_LEVEL_DIRECTIVE" &&
          log.message.includes('"use client"') &&
          /node_modules\/(?:@radix-ui\/|@trackdraw\/viewer\/)/.test(
            log.id ?? log.message,
          )
        )
          return;
        defaultHandler(level, log);
      },
    },
  },
});
