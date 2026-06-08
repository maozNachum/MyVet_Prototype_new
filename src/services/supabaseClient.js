import { createClient } from '@supabase/supabase-js'

// כתובת הפרויקט שלכם מהדשבורד
const supabaseUrl = 'https://bavpqmopcrhtrwatmyng.supabase.co/rest/v1/' 
// ה-Publishable Key שצילמת (הראשון ברשימה)
const supabaseAnonKey = 'sb_publishable_ESW03dg7oDHpN8uyDlYwMw_3jFOTfIX' 

export const supabase = createClient(supabaseUrl, supabaseAnonKey)