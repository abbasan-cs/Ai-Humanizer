import { supabase } from '../lib/supabaseClient';
import toast from 'react-hot-toast';

export async function humanizeText(userId: string, originalText: string): Promise<string | null> {
  try {
    // Check user credits and plan
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('credits, plan')
      .eq('id', userId)
      .single();

    if (profileError) throw profileError;
    
    if (profile.plan !== 'premium' && profile.credits <= 0) {
      toast.error('You have no credits left. Please upgrade your plan.');
      return null;
    }

    // Call the Undetectable API
    const response = await fetch('https://humanize.undetectable.ai/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_UNDETECTABLE_API_KEY,
      },
      body: JSON.stringify({
        content: originalText,
        readability: 'High School',
        purpose: 'General Writing',
        strength: 'More Human',
        model: 'v11',
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to humanize text');
    }

    const data = await response.json();
    const humanizedText = data.humanized || data.content;

    // Save to history
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

    // Update credits only for non-premium users
    if (profile.plan !== 'premium') {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ credits: profile.credits - 1 })
        .eq('id', userId);
      if (updateError) throw updateError;
    }

    return humanizedText;
  } catch (error: any) {
    console.error('Error humanizing text:', error.message);
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
    console.error('Error fetching history:', error.message);
    toast.error('Failed to load history');
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
    return true;
  } catch (error: any) {
    console.error('Error upgrading plan:', error.message);
    toast.error('Failed to upgrade plan');
    return false;
  }
}