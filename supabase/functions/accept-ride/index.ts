import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from "npm:resend@2.0.0";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const resendApiKey = Deno.env.get('RESEND_API_KEY')!;

const supabase = createClient(supabaseUrl, supabaseKey);
const resend = new Resend(resendApiKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AcceptRideRequest {
  ride_id: string;
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

    const { ride_id }: AcceptRideRequest = await req.json();

    // Get driver profile
    const { data: driverProfile, error: driverError } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (driverError || !driverProfile) {
      throw new Error('Driver profile not found');
    }

    // Check if driver has a driver profile setup
    const { data: driverVehicle, error: vehicleError } = await supabase
      .from('driver_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (vehicleError || !driverVehicle) {
      throw new Error('Driver vehicle profile not found');
    }

    // Get the ride details
    const { data: ride, error: rideError } = await supabase
      .from('rides')
      .select(`
        *,
        profiles!rides_customer_id_fkey(full_name, phone)
      `)
      .eq('id', ride_id)
      .eq('status', 'pending')
      .single();

    if (rideError || !ride) {
      throw new Error('Ride not found or already accepted');
    }

    // Update the ride with driver and status
    const { error: updateError } = await supabase
      .from('rides')
      .update({
        driver_id: user.id,
        status: 'accepted',
      })
      .eq('id', ride_id);

    if (updateError) {
      throw updateError;
    }

    // Get customer details for email
    const { data: customer, error: customerError } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', ride.customer_id)
      .single();

    if (customerError) {
      throw customerError;
    }

    // Get customer's auth details for email
    const { data: customerAuth, error: customerAuthError } = await supabase.auth.admin.getUserById(ride.customer_id);
    
    if (customerAuthError || !customerAuth.user) {
      throw new Error('Customer auth details not found');
    }

    // Send email notifications
    try {
      // Email to customer
      await resend.emails.send({
        from: 'LocalRide <onboarding@resend.dev>',
        to: [customerAuth.user.email!],
        subject: 'Ride Accepted - LocalRide',
        html: `
          <h1>Your Ride Has Been Accepted!</h1>
          <p>Dear ${customer.full_name || 'Customer'},</p>
          <p>Great news! A driver has accepted your ride request.</p>
          
          <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h3>Ride Details:</h3>
            <p><strong>From:</strong> ${ride.from_location}</p>
            <p><strong>To:</strong> ${ride.to_location}</p>
            <p><strong>Pickup Time:</strong> ${new Date(ride.pickup_time).toLocaleString()}</p>
            <p><strong>Vehicle Type:</strong> ${ride.vehicle_type.toUpperCase()}</p>
            <p><strong>Estimated Fare:</strong> ₹${ride.estimated_fare}</p>
          </div>
          
          <div style="background: #e8f5e8; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h3>Driver Details:</h3>
            <p><strong>Name:</strong> ${driverProfile.full_name || 'Driver'}</p>
            <p><strong>Phone:</strong> ${driverProfile.phone || 'Not provided'}</p>
            <p><strong>Vehicle:</strong> ${driverVehicle.vehicle_type.toUpperCase()} - ${driverVehicle.vehicle_number}</p>
          </div>
          
          <p>Your driver will contact you shortly. Please be ready at the pickup location on time.</p>
          <p>Thank you for choosing LocalRide!</p>
        `,
      });

      // Email to driver
      await resend.emails.send({
        from: 'LocalRide <onboarding@resend.dev>',
        to: [user.email!],
        subject: 'Ride Assignment Confirmed - LocalRide',
        html: `
          <h1>Ride Assignment Confirmed</h1>
          <p>Dear ${driverProfile.full_name || 'Driver'},</p>
          <p>You have successfully accepted a ride request.</p>
          
          <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h3>Ride Details:</h3>
            <p><strong>From:</strong> ${ride.from_location}</p>
            <p><strong>To:</strong> ${ride.to_location}</p>
            <p><strong>Pickup Time:</strong> ${new Date(ride.pickup_time).toLocaleString()}</p>
            <p><strong>Vehicle Type:</strong> ${ride.vehicle_type.toUpperCase()}</p>
            <p><strong>Estimated Fare:</strong> ₹${ride.estimated_fare}</p>
          </div>
          
          <div style="background: #e8f5e8; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h3>Customer Details:</h3>
            <p><strong>Name:</strong> ${customer.full_name || 'Customer'}</p>
            <p><strong>Phone:</strong> ${customer.phone || 'Not provided'}</p>
          </div>
          
          <p>Please contact the customer and be at the pickup location on time.</p>
          <p>Thank you for being part of LocalRide!</p>
        `,
      });
    } catch (emailError) {
      console.error('Failed to send email:', emailError);
      // Don't fail the request if email fails
    }

    // Create notifications
    await Promise.all([
      // Notification for customer
      supabase
        .from('ride_notifications')
        .insert({
          ride_id: ride_id,
          user_id: ride.customer_id,
          message: `Your ride has been accepted by ${driverProfile.full_name || 'a driver'}. They will contact you shortly.`,
        }),
      // Notification for driver
      supabase
        .from('ride_notifications')
        .insert({
          ride_id: ride_id,
          user_id: user.id,
          message: `You have successfully accepted a ride from ${ride.from_location} to ${ride.to_location}.`,
        }),
    ]);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in accept-ride function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});