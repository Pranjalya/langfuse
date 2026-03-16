import type { NextApiRequest, NextApiResponse } from "next";

export const createNewSsoConfigHandler = async (
  req: NextApiRequest,
  res: NextApiResponse,
) => {
  return res.status(404).json({ message: "EE feature not available" });
};
