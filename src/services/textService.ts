import { supabase } from '../lib/supabaseClient';
import toast from 'react-hot-toast';

import { supabase } from '../lib/supabaseClient';
import toast from 'react-hot-toast';

export async function humanizeText(userId: string, originalText: string): Promise<string | null> {
  console.log("🟢 Starting humanizeText for user:", userId);

  try {
    // STEP 1: Validate credits
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', userId)
      .single();

    if (profileError) throw profileError;
    if (!profile || typeof profile.credits !== 'number') {
      throw new Error('Profile not found or malformed.');
    }

    if (profile.credits <= 0) {
      toast.error('You have no credits left. Please upgrade your plan.');
      return null;
    }

    const apiKey = import.meta.env.VITE_UNDETECTABLE_API_KEY;
    if (!apiKey) {
      throw new Error('Missing Undetectable API key.');
    }

    // STEP 2: Submit to Undetectable
    const submitResponse = await fetch('https://humanize.undetectable.ai/submit', {
      method: 'POST',
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: originalText,
        readability: 'High School',
        purpose: 'General Writing',
        strength: 'More Human',
        model: 'v11',
      }),
    });

    let submitData;
    try {
      submitData = await submitResponse.json();
    } catch {
      throw new Error('Failed to parse response from Undetectable.');
    }

    const documentId = submitData?.id;
    if (!documentId) {
      console.error("❌ No document ID returned", submitData);
      throw new Error('Undetectable API did not return a document ID.');
    }

    console.log("📨 Document ID:", documentId);

    // STEP 3: Poll for output
    let humanizedText: string | null = null;

    for (let i = 0; i < 6; i++) {
      console.log(`⏳ Polling attempt ${i + 1}...`);
      await new Promise((res) => setTimeout(res, 10000));

      const statusResponse = await fetch('https://humanize.undetectable.ai/document', {
        method: 'POST',
        headers: {
          'apikey': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: documentId }),
      });

      let statusData;
      try {
        statusData = await statusResponse.json();
      } catch {
        console.warn('⚠️ Polling response not JSON:', await statusResponse.text());
        continue;
      }

      if (statusData.status === 'done' && statusData.output) {
        humanizedText = statusData.output;
        console.log('✅ Humanized output received.');
        break;
      }
    }

    if (!humanizedText) {
      throw new Error('Humanized text was not ready after polling.');
    }

    // STEP 4: Save result to Supabase
    const { error: insertError } = await supabase
      .from('humanized_texts')
      .insert([
        {
          user_id: userId,
          original_text: originalText,
          humanized_text: humanizedText,
        },
      ]);
    if (insertError) throw insertError;

    // STEP 5: Deduct 1 credit
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ credits: profile.credits - 1 })
      .eq('id', userId);
    if (updateError) throw updateError;

    return humanizedText;
  } catch (error: any) {
    console.error('❌ Error humanizing text:', error?.message || error);
    toast.error('Failed to humanize text. Please try again.');
    return null;
  }
}


export async function getUserHistory(userId: string) {
  try {
    const { data, error } = await supabase
      .from('humanized_texts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    return data || [];
  } catch (error: any) {
    console.error('Error fetching user history:', error.message);
    toast.error('Failed to load your history.');
    return [];
  }
}

export async function upgradeUserPlan(userId: string, plan: string, credits: number) {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ 
        plan: plan,
        credits: credits
      })
      .eq('id', userId);

    if (error) throw error;
    
    toast.success(`Successfully upgraded to ${plan} plan!`);
    return true;
  } catch (error: any) {
    console.error('Error upgrading plan:', error.message);
    toast.error('Failed to upgrade plan. Please try again.');
    return false;
  }
}
