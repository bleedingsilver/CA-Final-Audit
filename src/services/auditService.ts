import { GoogleGenAI, Type } from "@google/genai";
import { Question } from "../types";
import { db, collection, getDocs, query, where, setDoc, doc } from "../firebase";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

async function safeGenerateContent(params: any, retries = 3, delay = 2000): Promise<any> {
  try {
    return await ai.models.generateContent(params);
  } catch (error: any) {
    // Handle rate limit (429) or other transient errors
    const isRateLimit = error?.status === "RESOURCE_EXHAUSTED" || error?.code === 429 || error?.message?.includes("429");
    
    if (isRateLimit && retries > 0) {
      console.warn(`Rate limit exceeded. Retrying in ${delay}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return safeGenerateContent(params, retries - 1, delay * 2);
    }
    throw error;
  }
}

export const auditService = {
  async fetchQuestions(chapterName: string, uploadedFiles: { data: string; mimeType: string; name: string }[] = []): Promise<Question[]> {
    const model = "gemini-3.1-pro-preview";
    
    // 1. Try to fetch from Firestore baseline first
    const q = query(collection(db, "questions"), where("chapterName", "==", chapterName));
    const snapshot = await getDocs(q);
    let baselineQuestions: Question[] = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Question));

    // 2. If no baseline or user uploaded new files, fetch from AI/Search
    if (baselineQuestions.length === 0 || uploadedFiles.length > 0) {
      const prompt = `
        You are an expert CA Final Auditing tutor. 
        The user is studying the chapter: "${chapterName}" from the CA Final Advanced Auditing, Assurance and Professional Ethics syllabus.
        
        Task:
        1. Use Google Search to find questions related to this chapter from the ICAI Board of Studies (BoS) portal, specifically looking at Past Papers and RTPs (Revision Test Papers) which are publicly available.
        2. I have also provided some uploaded files. These files contain Mock Test Papers (MTPs) - both Question papers and their corresponding Answer keys/Suggested Answers.
        3. Analyze the uploaded files carefully. Match the questions to their answers provided in the answer files.
        4. Extract questions specifically related to "${chapterName}" from BOTH the search results (Past Papers/RTPs) and the uploaded files (MTPs).
        5. DO NOT DEDUPLICATE. If a topic or question (like SQC 1 or SA 220) is repeated across multiple papers, keep all instances. The user will decide whether to skip.
        6. For each question, determine how many times this specific topic or case has appeared in the past 10-15 attempts (Past Papers, RTPs, MTPs).
        7. Return a list of at least 10-15 questions (including repetitions).
        
        For each question, provide:
        - id: A unique ID (e.g., "MTP-OCT23-Q1")
        - source: (e.g., "MTP Oct 2023 Series 1", "Past Paper Nov 2022", "RTP May 2024").
        - text: The full question text.
        - correctAnswerHeading: The correct main topic heading/identification.
        - keywords: A list of 5-10 essential keywords or sub-points.
        - repetitionCount: The number of times this specific topic/question has been tested.
        - isExactRepetition: A boolean indicating if the exact scenario/case in the question has appeared before.
        - boldedSuggestedAnswer: The full suggested answer with missing parts bolded.
      `;

      const response = await safeGenerateContent({
        model,
        contents: [
          {
            parts: [
              { text: prompt },
              ...uploadedFiles.map(file => ({
                inlineData: {
                  data: file.data,
                  mimeType: file.mimeType
                }
              }))
            ]
          }
        ],
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                source: { type: Type.STRING },
                text: { type: Type.STRING },
                correctAnswerHeading: { type: Type.STRING },
                keywords: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                },
                repetitionCount: { type: Type.INTEGER },
                isExactRepetition: { type: Type.BOOLEAN },
                boldedSuggestedAnswer: { type: Type.STRING }
              },
              required: ["id", "source", "text", "correctAnswerHeading", "keywords", "repetitionCount", "isExactRepetition", "boldedSuggestedAnswer"]
            }
          }
        }
      });

      const newQuestions: Question[] = JSON.parse(response.text || "[]");
      
      // 3. Save new questions to baseline (Firestore) for future use
      for (const question of newQuestions) {
        const docRef = doc(db, "questions", question.id);
        await setDoc(docRef, { ...question, chapterName }, { merge: true });
      }

      return [...baselineQuestions, ...newQuestions];
    }

    return baselineQuestions;
  },

  async ingestFullSyllabus(files: { data: string; mimeType: string; name: string }[]): Promise<{ count: number, chapters: string[] }> {
    const model = "gemini-3.1-pro-preview";
    const prompt = `
      You are a CA Final Audit expert. I am providing you with multiple files (Question Papers and Answer Keys/Suggested Answers) for various FULL SYLLABUS MTPs/RTPs/Past Papers.
      
      Your task is to:
      1. Analyze ALL provided files. Match each question from the question papers with its corresponding suggested answer from the answer keys.
      2. Extract ALL questions from these papers.
      3. For EACH question:
         - Identify the specific CA Final Audit chapter it belongs to (e.g., "Professional Ethics", "Audit of Banks", "Company Audit", "Audit Reports", etc.).
         - Identify the SOURCE of the question from the document text (e.g., "MTP May 2024 Series 1", "RTP Nov 2023", "Past Paper May 2022").
      4. Return a JSON array of objects, where each object is:
      {
        "chapterName": "...",
        "question": {
          "id": "...",
          "text": "...",
          "source": "...", // Extracted from document
          "repetitionCount": 1,
          "isExactRepetition": false,
          "correctAnswerHeading": "...",
          "keywords": ["...", "..."],
          "boldedSuggestedAnswer": "..."
        }
      }
    `;

    const response = await safeGenerateContent({
      model,
      contents: [
        {
          parts: [
            { text: prompt },
            ...files.map(file => ({
              inlineData: {
                data: file.data,
                mimeType: file.mimeType
              }
            }))
          ]
        }
      ],
      config: { responseMimeType: "application/json" }
    });

    const items = JSON.parse(response.text || "[]");
    const chapters = new Set<string>();

    for (const item of items) {
      const docRef = doc(db, "questions", item.question.id);
      await setDoc(docRef, { ...item.question, chapterName: item.chapterName }, { merge: true });
      chapters.add(item.chapterName);
    }

    return { count: items.length, chapters: Array.from(chapters) };
  },

  async seedBaseline(onProgress: (chapter: string) => void): Promise<void> {
    const chapters = [
      "Quality Control (SQC 1, SA 220)",
      "Audit of Financial Statements",
      "Audit Planning, Strategy and Execution",
      "Risk Assessment and Internal Control",
      "Audit Evidence",
      "Using Work of Others",
      "Audit Conclusions and Reporting",
      "Specialized Areas",
      "Audit of Consolidated Financial Statements",
      "Audit of Banks",
      "Audit of Insurance Companies",
      "Audit of NBFC",
      "Audit under Fiscal Laws (Tax Audit)",
      "Internal Audit, Management and Operational Audit",
      "Due Diligence, Investigation and Forensic Audit",
      "Peer Review and Quality Review",
      "Professional Ethics"
    ];

    for (const chapter of chapters) {
      onProgress(chapter);
      await this.fetchQuestions(chapter);
    }
  },

  async evaluateAnswer(
    question: Question, 
    userHeading: string, 
    userSubpoints: string
  ): Promise<{ 
    headingCorrect: boolean; 
    headingFeedback: string; 
    keywordFeedback: { keyword: string; found: boolean }[];
    overallFeedback: string;
  }> {
    const model = "gemini-3.1-pro-preview";
    
    const prompt = `
      Question: ${question.text}
      Expected Heading: ${question.correctAnswerHeading}
      Expected Keywords: ${question.keywords.join(", ")}
      
      User's Heading Identification: "${userHeading}"
      User's Subpoints/Keywords: "${userSubpoints}"
      
      STRICT EVALUATION RULE: 
      ICAI marks strictly based on technical keywords. DO NOT accept paraphrasing. Even if the meaning is the same, if the specific technical keyword or professional terminology is missing, it must be marked as NOT found.
      
      Evaluate the user's response:
      1. Is the heading identification EXACTLY or professionally equivalent to the ICAI requirement?
      2. Check which of the expected keywords/subpoints are present. Only mark as "found" if the EXACT technical term or a very close professional variant is used. General descriptions or paraphrasing MUST be marked as "found: false".
      3. Provide the full suggested answer based on ICAI standards.
      4. Create a "boldedSuggestedAnswer" where you take the full suggested answer and wrap parts NOT found or NOT used with exact technical keywords in **bold markdown**.
      5. Provide constructive feedback, specifically pointing out where the user used general language instead of ICAI technical keywords.
      
      Criteria for Keyword Match (STRICT):
      - NO PARAPHRASING: Meaning similarity is NOT enough.
      - EXACT TERMINOLOGY: The specific technical auditing term (e.g., "Professional Skepticism", "Material Misstatement", "Inherent Risk") must be present.
      - ZERO TOLERANCE: If the keyword is missing, the score for that point is effectively zero.
    `;

    const response = await safeGenerateContent({
      model,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            headingCorrect: { type: Type.BOOLEAN },
            headingFeedback: { type: Type.STRING },
            keywordFeedback: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  keyword: { type: Type.STRING },
                  found: { type: Type.BOOLEAN }
                }
              }
            },
            suggestedAnswer: { type: Type.STRING },
            boldedSuggestedAnswer: { type: Type.STRING },
            overallFeedback: { type: Type.STRING }
          },
          required: ["headingCorrect", "headingFeedback", "keywordFeedback", "suggestedAnswer", "boldedSuggestedAnswer", "overallFeedback"]
        }
      }
    });

    return JSON.parse(response.text || "{}");
  },

  async getDatabaseStats(): Promise<{ total: number; byChapter: Record<string, number>; sources: string[] }> {
    const q = query(collection(db, "questions"));
    const snapshot = await getDocs(q);
    const stats = {
      total: snapshot.size,
      byChapter: {} as Record<string, number>,
      sources: new Set<string>()
    };

    snapshot.forEach(doc => {
      const data = doc.data();
      const chapter = data.chapterName || "Uncategorized";
      stats.byChapter[chapter] = (stats.byChapter[chapter] || 0) + 1;
      if (data.source) stats.sources.add(data.source);
    });

    return {
      total: stats.total,
      byChapter: stats.byChapter,
      sources: Array.from(stats.sources)
    };
  },

  async getAllQuestions(): Promise<Question[]> {
    const q = query(collection(db, "questions"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question));
  }
};
