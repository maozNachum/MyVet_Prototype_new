import { createClient } from '@supabase/supabase-js';

// משיכת הנתונים המאובטחים שהגדרנו בקובץ ה-env.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// יצירת הצינור החי מול מסד הנתונים
export const supabase = createClient(supabaseUrl, supabaseKey);