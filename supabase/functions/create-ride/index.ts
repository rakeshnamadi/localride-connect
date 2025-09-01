import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, supabaseKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateRideRequest {
  from_location: string;
  to_location: string;
  pickup_time: string;
  vehicle_type: 'auto' | 'car' | 'bike';
  notes?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the authenticated user
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { from_location, to_location, pickup_time, vehicle_type, notes }: CreateRideRequest = await req.json();

    // Get customer profile
    const { data: customerProfile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (profileError || !customerProfile) {
      throw new Error('Customer profile not found');
    }

    // Calculate estimated fare (basic calculation)
    const baseFare = vehicle_type === 'bike' ? 30 : vehicle_type === 'auto' ? 50 : 80;
    const estimatedFare = Math.round(baseFare + Math.random() * 100); // Simple random fare calculation

    // Create the ride
    const { data: ride, error: rideError } = await supabase
      .from('rides')
      .insert({
        customer_id: user.id,
        from_location,
        to_location,
        pickup_time,
        vehicle_type,
        notes,
        estimated_fare: estimatedFare,
      })
      .select()
      .single();

    if (rideError) {
      throw rideError;
    }

    // Email notifications disabled

    // Create notification for customer
    await supabase
      .from('ride_notifications')
      .insert({
        ride_id: ride.id,
        user_id: user.id,
        message: `Your ride request from ${from_location} to ${to_location} has been submitted.`,
      });

    return new Response(JSON.stringify({ success: true, ride }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in create-ride function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});