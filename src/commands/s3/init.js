#!/usr/bin/env node

"use strict";

// TODO: need to test this

// TODO: upload the CRA template, upload the scripts and upload the react version of hci kit

const chalk = require("chalk");
const AWS = require("aws-sdk");
const getAWSCredentials = require("../../aws-credentials");
const fs = require("fs-extra");
const os = require("os");
const path = require("path");
const spawn = require("cross-spawn");

const paths = require("../../paths");

exports.command = "s3-init";

exports.describe =
  "Uses the app name from package.json and deletes all related S3 storage items from AWS.";

exports.builder = {
  region: {
    default: "us-east-2",
    alias: ["aws-region", "r"],
  },
};

const appPath = paths.appPath;
const ownPath = paths.ownPath;
const appPackage = require(paths.appPackageJson);
let appName = appPackage.name;

exports.handler = async ({ region }) => {
  await getAWSCredentials();

  AWS.config.update({ region });

  const s3 = new AWS.S3();
  const cognito = new AWS.CognitoIdentity();
  const iam = new AWS.IAM();

  await addScripts(appName);
  await createUploadsBucket(appName, s3, cognito, iam);
  await createWebsiteBucket(appName, s3);

  console.log(`S3 Setup Complete!`);

  console.log();

  console.log(
    `You still need to register the upload component and add it into your configuration to start logging.
  
        ${chalk.yellow(`import S3Upload from "./S3Upload";`)}

Then register by passing it to your experiment in the tasks object.`
  );

  console.log(`Add it to your config like:
  ${chalk.yellow(`{
    task: 'S3Upload',
    filename: 'blaine_log',
    experimenter: 'hello@world.com',
  }`)}
      `);

  console.log();

  console.log(
    `You can now deploy to s3 by running ${chalk.blue("npm run deploy")}.`
  );

  console.log(
    `Your experiment will be accessible from ${chalk.green(
      `http://${appName}.s3-website.${s3.config.region}.amazonaws.com/`
    )}.`
  );

  console.log(
    `You can view completed logs at ${chalk.green(
      `https://s3.console.aws.amazon.com/s3/buckets/${appName}-uploads/`
    )}.`
  );

  console.log(
    `Or download them by running ${chalk.blue("npm run sync-data")}.`
  );
  console.log(
    "For deploying and downloading logs you must first install the aws-cli."
  );
};

// // TODO: have something check if AWS and what not is setup properly, and get credentials from password thing if not.
// // TODO: Explaining how to setup credentials is tricky, it would be nice if there was a better way.

async function addScripts(appName) {
  //TODO: this should use the node API so there isn't a dependency of a CLI application
  appPackage.scripts = appPackage.scripts || {};
  appPackage.scripts.deploy = `aws s3 sync build/ s3://${appName}`;
  appPackage.scripts.predeploy = "npm run build";
  appPackage.scripts["sync-data"] = `aws s3 sync data/ s3://${appName}-uploads`;

  return fs.promises.writeFile(
    path.join(appPath, "package.json"),
    JSON.stringify(appPackage, null, 2) + os.EOL
  );
}

async function createWebsiteBucket(appName, s3) {
  console.log(`Creating bucket ${chalk.green(appName)}...`);
  await s3.createBucket({ Bucket: appName }).promise();
  console.log(`${chalk.green(appName)} created!`);

  console.log(`Converting ${chalk.green(appName)} to website bucket...`);
  await s3
    .putBucketWebsite({
      Bucket: appName,
      WebsiteConfiguration: {
        ErrorDocument: {
          Key: "index.html",
        },
        IndexDocument: {
          Suffix: "index.html",
        },
      },
    })
    .promise();

  console.log(`Applying bucket policy to ${chalk.green(appName)}...`);
  await s3
    .putBucketPolicy({
      Bucket: appName,
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "PublicReadGetObject",
            Effect: "Allow",
            Principal: "*",
            Action: ["s3:GetObject"],
            Resource: [`arn:aws:s3:::${appName}/*`],
          },
        ],
      }),
    })
    .promise();

  console.log(`Setup complete!`);
}

async function createUploadsBucket(appName, s3, cognito, iam) {
  appName = `${appName}-uploads`;

  console.log(`Creating bucket ${chalk.green(appName)}...`);
  await s3.createBucket({ Bucket: appName }).promise();

  console.log(`Updating CORS policy for ${chalk.green(appName)}...`);
  s3.putBucketCors({
    Bucket: appName,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: ["*"],
          AllowedMethods: ["PUT", "POST"],
          AllowedHeaders: ["*"],
          ExposeHeaders: ["ETag"],
        },
      ],
    },
  })
    .promise()
    .then(() => console.log(`Updated CORS policy for ${chalk.green(appName)}`));

  const cognitoName = appName.replace(/[^\w]/g, "_");
  console.log(`Creating cognito pool ${chalk.blue(cognitoName)}...`);

  const cognitoIdentityPool = await cognito
    .createIdentityPool({
      AllowUnauthenticatedIdentities: true,
      IdentityPoolName: cognitoName,
    })
    .promise();

  console.log(`Cognito pool ${chalk.blue(cognitoName)} created!`);

  fs.writeFileSync(
    path.join(appPath, "src", "S3Upload.js"),
    `
import { createS3Uploader } from "./s3Uploader";
import { createUpload } from "@hcikit/react";

let uploadComponent = createUpload(
  createS3Uploader(
    "${s3.config.region}",
    "${cognitoIdentityPool.IdentityPoolId}",
    "${appName}"
  )
);

export default uploadComponent;
`
  );

  fs.copySync(
    path.join(ownPath, "template", "s3Uploader.js"),
    path.join(appPath, "src", "s3Uploader.js")
  );

  console.log(
    `Cognito pool ID: ${chalk.green(cognitoIdentityPool.IdentityPoolId)}`
  );

  var RoleName = `Cognito_${cognitoIdentityPool.IdentityPoolName}Unauth_Role`;
  var IdentityPoolId = cognitoIdentityPool.IdentityPoolId;

  console.log(`Creating role for congito users ${chalk.yellow(RoleName)}...`);
  const Role = await iam
    .createRole({
      RoleName,
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Federated: "cognito-identity.amazonaws.com" },
            Action: "sts:AssumeRoleWithWebIdentity",
            Condition: {
              StringEquals: {
                "cognito-identity.amazonaws.com:aud": IdentityPoolId,
              },
              "ForAnyValue:StringLike": {
                "cognito-identity.amazonaws.com:amr": "unauthenticated",
              },
            },
          },
        ],
      }),
    })
    .promise();

  console.log(`Creating policy for bucket access...`);
  console.log(`Assigning role to cognito pool...`);
  await Promise.all([
    cognito
      .setIdentityPoolRoles({
        IdentityPoolId,
        Roles: {
          unauthenticated: Role.Role.Arn,
        },
      })
      .promise(),
    iam
      .putRolePolicy({
        RoleName,
        PolicyName: "S3",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: ["s3:PutObject", "s3:PutObjectAcl"],
              Resource: `arn:aws:s3:::${appName}/*`,
            },
          ],
        }),
      })
      .promise(),
  ]);

  console.log("Uploads bucket setup complete!");

  const useYarn = fs.existsSync(path.join(appPath, "yarn.lock"));

  let args;
  let command;

  if (useYarn) {
    command = "yarnpkg";
    args = ["add"];
  } else {
    command = "npm";
    args = ["install", "--save"].filter((e) => e);
  }

  args.push("aws-sdk");

  // TODO: error handling would be great.
  spawn.sync(command, args, { stdio: "inherit" });
}
