import { GoogleGenAI } from "@google/genai";
import { Entity } from "../types";

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

export const generateLore = async (entity: Entity): Promise<string> => {
  const client = getClient();
  if (!client) return "The archives are currently inaccessible (API Key missing).";

  const prompt = `
    Write a very short (max 2 sentences), flavorful description for a fantasy RTS unit.
    Unit Type: ${entity.subType}
    Name: ${entity.name}
    Faction: ${entity.faction}
    Current Status: ${entity.state || 'Idle'}
    HP: ${entity.hp}/${entity.maxHp}
    
    Style: Epic, high-fantasy, World of Warcraft style.
  `;

  try {
    const response = await client.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || "A mysterious entity.";
  } catch (error) {
    console.error("Lore generation failed", error);
    return "The scribes cannot describe this unit right now.";
  }
};

export const generateAdvisorTip = async (resources: { gold: number, wood: number, food: number }, unitCount: number): Promise<string> => {
  const client = getClient();
  if (!client) return "My liege, I cannot advise you without a connection to the stars.";

  const prompt = `
    You are a Royal Advisor in a fantasy RTS game.
    Current Resources: ${resources.gold} Gold, ${resources.wood} Wood, ${resources.food} Food.
    Army Size: ${unitCount} units.
    
    Give me a one-sentence strategic tip or a witty remark about the kingdom's state. 
    If gold is low, suggest gathering. If food is low, suggest farms. 
    Keep it immersive.
  `;

  try {
    const response = await client.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || "We must act swiftly, my liege.";
  } catch (error) {
    return "The spirits remain silent.";
  }
};
