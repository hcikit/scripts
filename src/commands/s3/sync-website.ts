#!/usr/bin/env node

import S3SyncClient from "s3-sync-client";
import path from "path";
import { appPath } from "../../paths";

export let command = "s3-sync-website";

export let describe =
  "Use environment variables to sync the build folder with the website.";

exports.handler = async () => {
  const sync = new S3SyncClient({});

  let dir = path.join(appPath, "build");
  await sync.bucketWithLocal(dir, process.env.AWS_WEBSITE_BUCKET);

  console.log(
    `Upload complete. Visit your website at ${process.env.AWS_WEBSITE_URL}`
  );
};
