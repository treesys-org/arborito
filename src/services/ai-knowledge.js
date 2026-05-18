export const SAGE_KNOWLEDGE_TREE = {
    "root": {
        "description": "Navigation root",
        "subfolders": ["greetings", "help", "arborito_info", "learning_tips"],
        "responses": {
            "default": "No estoy seguro de cómo responder a eso, pero puedo ayudarte a explorar el contenido del curso o puedes buscar en las lecciones."
        }
    },
    "greetings": {
        "description": "Common greetings and pleasantries",
        "keywords": ["hola", "buen dia", "buenas", "hello", "hi", "hey", "buen", "tardes", "noches", "que tal", "como estas", "how are you", "good morning"],
        "responses": {
            "default": "¡Hola! Soy el Búho Sabio. ¿En qué te puedo ayudar hoy con tus estudios?"
        }
    },
    "help": {
        "description": "User asking for help or how to use the app",
        "keywords": ["ayuda", "help", "como", "funciona", "que hago", "instrucciones"],
        "responses": {
            "default": "Puedo ayudarte resumiendo lecciones, explicando conceptos complejos o haciéndote preguntas de práctica. Solo tienes que pedirlo.",
            "search": "Si buscas algo específico, tenemos un buscador incorporado en la aplicación que rastrea todas las lecciones."
        }
    },
    "arborito_info": {
        "description": "Information about the Arborito platform and the AI",
        "keywords": ["quien eres", "que eres", "who are you", "what are you", "sos persona", "are you ai", "arborito", "plataforma", "aplicacion", "app"],
        "responses": {
            "default": "Soy una inteligencia artificial ejecutada directamente en tu dispositivo, diseñada para la plataforma Arborito. Mi objetivo es ser tu tutor personal y guiarte en tu camino de aprendizaje.",
            "arborito": "Arborito es una plataforma descentralizada y libre para aprender de forma autónoma. Todo vive en tu dispositivo o se comparte mediante redes P2P."
        }
    },
    "learning_tips": {
        "description": "Advice on how to study better",
        "keywords": ["tips", "consejos", "como estudiar", "aprender mejor", "estudio", "recomendacion"],
        "responses": {
            "default": "Para estudiar mejor, te recomiendo leer un poco cada día, resumir lo que aprendes con tus propias palabras y usar la opción de cuestionarios para ponerte a prueba."
        }
    }
};

export function navigateKnowledgeTree(query, path = "root") {
    // Simplify query for matching
    const norm = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim();
    const words = norm.split(/\s+/);
    
    // Find best matching folder from root
    let bestFolder = "root";
    let maxMatch = 0;
    
    for (const [folderId, folderData] of Object.entries(SAGE_KNOWLEDGE_TREE)) {
        if (folderId === "root") continue;
        
        let matches = 0;
        if (folderData.keywords) {
            for (const word of words) {
                if (word.length > 2 && folderData.keywords.some(k => k.includes(word) || word.includes(k))) {
                    matches++;
                }
            }
        }
        
        if (matches > maxMatch) {
            maxMatch = matches;
            bestFolder = folderId;
        }
    }
    
    if (maxMatch > 0) {
        return {
            path: bestFolder,
            response: SAGE_KNOWLEDGE_TREE[bestFolder].responses.default
        };
    }
    
    return null;
}

