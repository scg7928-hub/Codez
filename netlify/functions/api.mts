import serverless from "serverless-http";
import app from "../../api-server/src/app.ts";

const handler = serverless(app);

export default async (req: Request, context: any) => {
  return handler(req, context);
};
