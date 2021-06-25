import AWS from "aws-sdk";

let AWS_REGION = "us-east-2";
let AWS_S3_BUCKET = "test-uploadsbucket-4mavv8w03d0b";
// "arn:aws:s3:::test-uploadsbucket-4mavv8w03d0b";
let AWS_COGNITO_IDENTITY_POOL_ID =
  "us-east-2:9d8e144e-bb1f-4306-96ad-0cdb11ea893e";

AWS.config.region = AWS_REGION;

AWS.config.credentials = new AWS.CognitoIdentityCredentials({
  IdentityPoolId: AWS_COGNITO_IDENTITY_POOL_ID,
});

let s3 = new AWS.S3({
  apiVersion: "2006-03-01",
  params: { Bucket: AWS_S3_BUCKET },
});

// https://blog.mturk.com/tutorial-how-to-create-hits-that-ask-workers-to-upload-files-using-amazon-cognito-and-amazon-s3-38acb1108633

let fileName = "test";
let data = { hello: "world" };
await s3
  .upload({
    Key: fileName,
    Body: JSON.stringify(data),
    ContentType: "json",
    ACL: "bucket-owner-full-control",
  })
  .promise();
