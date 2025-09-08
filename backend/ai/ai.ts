"use server";
import { pipeline } from "@xenova/transformers";

type Message = [
  {
    role: "system";
    message: string;
  },
  {
    role: "user";
    message: string;
  }
];

const gemma3Pipeline =  pipeline(
  "text2text-generation",
  "google/gemma-3-27b-it"
);

export const generateText = async (message: Message) => {
  const response = await gemma3Pipeline();
  console.log(response);
};
