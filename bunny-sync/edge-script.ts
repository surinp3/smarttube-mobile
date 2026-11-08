// Bunny Edge Scripting standalone entrypoint. Bundle the local handler.mjs
// before deployment. The Bunny database URL and token remain Edge secrets.
import * as BunnySDK from "npm:@bunny.net/edgescript-sdk@0.12.1";
import { connect } from "npm:@bunny.net/database-client";
import { createSyncHandler } from "./handler.mjs";

const db = connect({ timeout: 3500 });

BunnySDK.net.http.serve(createSyncHandler(db, {
  setupCode: Deno.env.get("BUNNY_SYNC_SETUP_CODE"),
  rumbleApiKey: Deno.env.get("APISH_KEY"),
  onError: (error) => console.error("SmartTube sync request failed:", error),
}));
