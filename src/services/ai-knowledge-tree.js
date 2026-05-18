export const KNOWLEDGE_DB = [
    {
        category: "saludos",
        keywords: ["hola", "buen dia", "buenas", "hello", "hi", "hey", "buen", "tardes", "noches", "que tal", "como estas", "how are you", "good morning"],
        response: "¡Hola! Estoy listo para empezar. ¿Qué tema vamos a estudiar hoy?"
    },
    {
        category: "agradecimientos",
        keywords: ["gracias", "muchas gracias", "te lo agradezco", "thank you", "thanks", "genial", "perfecto", "excelente", "muy bien"],
        response: "¡De nada! Recuerda que estoy aquí siempre que necesites repasar algo."
    },
    {
        category: "identidad",
        keywords: ["quien eres", "que eres", "who are you", "sos persona", "are you ai", "como te llamas", "que sabes hacer", "cual es tu funcion"],
        response: "Soy el Búho Sabio, una inteligencia artificial que vive dentro de Arborito. Mi misión es ayudarte a estudiar, analizar textos y resumir conceptos sin necesidad de internet."
    },
    {
        category: "arborito_ayuda",
        keywords: ["que es arborito", "para que sirve arborito", "arborito", "plataforma", "esta app"],
        response: "Arborito es una plataforma descentralizada para el aprendizaje libre. No requiere servidores centrales, lo que significa que tus planes de estudio viven en tu propio dispositivo."
    },
    {
        category: "tecnicas_estudio",
        keywords: ["como estudiar mejor", "tecnicas de estudio", "no me concentro", "pomodoro", "como memorizar", "memoria", "consejos para estudiar", "me cuesta estudiar"],
        response: "Un buen truco es la 'Técnica Pomodoro': estudia a fondo sin distracciones por 25 minutos y descansa 5. También te sugiero usar el botón de Cuestionario (Quiz) para que yo te ponga a prueba."
    },
    {
        category: "resolucion_problemas",
        keywords: ["lento", "se traba", "no funciona", "error", "se cuelga", "pesado", "tarda mucho"],
        response: "Si me siento lento al responder, ten en cuenta que estoy procesando el texto localmente en tu CPU. Si tu dispositivo tiene poca potencia, puedes cambiar el 'Proveedor de IA' a Cloud (Stable Horde) en la configuración."
    },
    {
        category: "lecciones_uso",
        keywords: ["como busco", "como encuentro", "no veo mis textos", "donde esta"],
        response: "Puedes usar la barra de búsqueda superior para encontrar palabras en todas tus lecciones descargadas."
    },
    {
        category: "chistes",
        keywords: ["cuentame un chiste", "dime un chiste", "bromas", "hazme reir"],
        response: "¿Qué hace un perro con un taladro? ¡Taladrando! Bueno... sigamos estudiando mejor."
    }
];

// Algorithmic router for exact intent mapping without LLM hallucination
export function findBestPredefinedResponse(msg) {
    const norm = msg.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (!norm || norm.length > 150) return null; // Long queries are given to the LLM for deep analysis

    let bestMatch = null;
    let maxScore = 0;

    for (const item of KNOWLEDGE_DB) {
        let score = 0;
        for (const kw of item.keywords) {
            const kwNorm = kw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
            // Full word boundary match gets higher points
            const regex = new RegExp(`\\b${kwNorm.replace(/\s+/g, '\\s+')}\\b`, 'i');
            if (regex.test(norm)) {
                score += 3;
            } else if (kwNorm.length > 4 && norm.includes(kwNorm)) {
                score += 1;
            }
        }
        if (score > maxScore) {
            maxScore = score;
            bestMatch = item;
        }
    }

    if (bestMatch && maxScore > 0) {
        return bestMatch.response;
    }
    return null;
}

