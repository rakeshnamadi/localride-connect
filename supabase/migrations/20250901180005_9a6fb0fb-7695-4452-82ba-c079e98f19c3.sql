-- Create vehicle type enum
CREATE TYPE public.vehicle_type AS ENUM ('auto', 'car', 'bike');

-- Create ride status enum
CREATE TYPE public.ride_status AS ENUM ('pending', 'accepted', 'in_progress', 'completed', 'cancelled');

-- Create locations table for predefined locations
CREATE TABLE public.locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create driver profiles table
CREATE TABLE public.driver_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  vehicle_type vehicle_type NOT NULL,
  vehicle_number TEXT NOT NULL,
  license_number TEXT,
  is_available BOOLEAN DEFAULT true,
  current_latitude DECIMAL(10, 8),
  current_longitude DECIMAL(11, 8),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Create rides table
CREATE TABLE public.rides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  driver_id UUID REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  from_location TEXT NOT NULL,
  to_location TEXT NOT NULL,
  from_latitude DECIMAL(10, 8),
  from_longitude DECIMAL(11, 8),
  to_latitude DECIMAL(10, 8),
  to_longitude DECIMAL(11, 8),
  pickup_time TIMESTAMP WITH TIME ZONE NOT NULL,
  vehicle_type vehicle_type NOT NULL,
  distance_km DECIMAL(8, 2),
  estimated_fare DECIMAL(10, 2),
  final_fare DECIMAL(10, 2),
  status ride_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create ride notifications table
CREATE TABLE public.ride_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ride_id UUID NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ride_notifications ENABLE ROW LEVEL SECURITY;

-- Locations policies (publicly readable for dropdowns)
CREATE POLICY "Locations are viewable by everyone" 
ON public.locations FOR SELECT USING (true);

CREATE POLICY "Only authenticated users can insert locations" 
ON public.locations FOR INSERT 
TO authenticated
WITH CHECK (true);

-- Driver profiles policies
CREATE POLICY "Drivers can view their own profile" 
ON public.driver_profiles FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Drivers can insert their own profile" 
ON public.driver_profiles FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Drivers can update their own profile" 
ON public.driver_profiles FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Customers can view available drivers" 
ON public.driver_profiles FOR SELECT 
USING (is_available = true);

-- Rides policies
CREATE POLICY "Users can view their own rides" 
ON public.rides FOR SELECT 
USING (auth.uid() = customer_id OR auth.uid() = driver_id);

CREATE POLICY "Customers can create rides" 
ON public.rides FOR INSERT 
WITH CHECK (auth.uid() = customer_id);

CREATE POLICY "Drivers can update rides they're assigned to" 
ON public.rides FOR UPDATE 
USING (auth.uid() = driver_id OR auth.uid() = customer_id);

-- Notifications policies
CREATE POLICY "Users can view their own notifications" 
ON public.ride_notifications FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "System can create notifications" 
ON public.ride_notifications FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Users can update their own notifications" 
ON public.ride_notifications FOR UPDATE 
USING (auth.uid() = user_id);

-- Add triggers for updated_at columns
CREATE TRIGGER update_driver_profiles_updated_at
BEFORE UPDATE ON public.driver_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_rides_updated_at
BEFORE UPDATE ON public.rides
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for real-time updates
ALTER TABLE public.rides REPLICA IDENTITY FULL;
ALTER TABLE public.ride_notifications REPLICA IDENTITY FULL;
ALTER TABLE public.driver_profiles REPLICA IDENTITY FULL;

-- Add tables to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.rides;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ride_notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_profiles;

-- Insert some sample locations
INSERT INTO public.locations (name, address, latitude, longitude) VALUES 
('City Center', 'Main Street, City Center', 12.9716, 77.5946),
('Airport', 'International Airport', 13.1986, 77.7066),
('Railway Station', 'Central Railway Station', 12.9760, 77.6038),
('Bus Stand', 'Main Bus Terminal', 12.9698, 77.6128),
('Hospital', 'General Hospital', 12.9584, 77.6401),
('Shopping Mall', 'Grand Mall', 12.9352, 77.6245),
('University', 'State University', 12.9279, 77.6271),
('Tech Park', 'IT Technology Park', 12.8463, 77.6627);