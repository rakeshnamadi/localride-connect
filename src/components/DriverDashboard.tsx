import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Car, Bike, Truck, MapPin, Clock, DollarSign } from 'lucide-react';

interface DriverProfile {
  id: string;
  vehicle_type: 'auto' | 'car' | 'bike';
  vehicle_number: string;
  license_number: string;
  is_available: boolean;
}

interface Ride {
  id: string;
  from_location: string;
  to_location: string;
  pickup_time: string;
  vehicle_type: 'auto' | 'car' | 'bike';
  status: 'pending' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';
  distance_km: number;
  estimated_fare: number;
  final_fare: number;
  notes: string;
  customer_id: string;
  profiles: {
    full_name: string;
    phone: string;
  };
}

const VehicleIcon = ({ type }: { type: string }) => {
  switch (type) {
    case 'car': return <Car className="h-4 w-4" />;
    case 'bike': return <Bike className="h-4 w-4" />;
    case 'auto': return <Truck className="h-4 w-4" />;
    default: return <Car className="h-4 w-4" />;
  }
};

const DriverDashboard = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [vehicleType, setVehicleType] = useState<'auto' | 'car' | 'bike'>('car');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [isProfileSetup, setIsProfileSetup] = useState(false);

  // Fetch driver profile
  const { data: driverProfile, isLoading } = useQuery({
    queryKey: ['driver-profile'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driver_profiles')
        .select('*')
        .eq('user_id', user?.id)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data as DriverProfile | null;
    },
  });

  // Fetch available rides for this driver's vehicle type
  const { data: availableRides = [] } = useQuery({
    queryKey: ['available-rides', driverProfile?.vehicle_type],
    queryFn: async () => {
      if (!driverProfile) return [];
      
      const { data, error } = await supabase
        .from('rides')
        .select(`
          *,
          profiles!rides_customer_id_fkey(full_name, phone)
        `)
        .eq('status', 'pending')
        .eq('vehicle_type', driverProfile.vehicle_type)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data as Ride[];
    },
    enabled: !!driverProfile,
  });

  // Fetch driver's accepted rides
  const { data: myRides = [] } = useQuery({
    queryKey: ['driver-rides'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rides')
        .select(`
          *,
          profiles!rides_customer_id_fkey(full_name, phone)
        `)
        .eq('driver_id', user?.id)
        .neq('status', 'completed')
        .neq('status', 'cancelled')
        .order('pickup_time', { ascending: true });
      
      if (error) throw error;
      return data as Ride[];
    },
    enabled: !!driverProfile,
  });

  useEffect(() => {
    if (driverProfile) {
      setVehicleType(driverProfile.vehicle_type);
      setVehicleNumber(driverProfile.vehicle_number);
      setLicenseNumber(driverProfile.license_number || '');
      setIsProfileSetup(true);
    }
  }, [driverProfile]);

  // Create/Update driver profile mutation
  const saveProfile = useMutation({
    mutationFn: async (profileData: any) => {
      if (driverProfile) {
        const { data, error } = await supabase
          .from('driver_profiles')
          .update(profileData)
          .eq('user_id', user?.id);
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from('driver_profiles')
          .insert({ ...profileData, user_id: user?.id });
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      toast.success('Profile saved successfully!');
      queryClient.invalidateQueries({ queryKey: ['driver-profile'] });
      setIsProfileSetup(true);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to save profile');
    },
  });

  // Toggle availability mutation
  const toggleAvailability = useMutation({
    mutationFn: async (isAvailable: boolean) => {
      const { data, error } = await supabase
        .from('driver_profiles')
        .update({ is_available: isAvailable })
        .eq('user_id', user?.id);
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver-profile'] });
    },
  });

  // Accept ride mutation
  const acceptRide = useMutation({
    mutationFn: async (rideId: string) => {
      const { data, error } = await supabase.functions.invoke('accept-ride', {
        body: { ride_id: rideId }
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Ride accepted successfully!');
      queryClient.invalidateQueries({ queryKey: ['available-rides'] });
      queryClient.invalidateQueries({ queryKey: ['driver-rides'] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to accept ride');
    },
  });

  // Update ride status mutation
  const updateRideStatus = useMutation({
    mutationFn: async ({ rideId, status, distance, fare }: { rideId: string; status: string; distance?: number; fare?: number }) => {
      const updateData: any = { status };
      if (distance) updateData.distance_km = distance;
      if (fare) updateData.final_fare = fare;
      
      const { data, error } = await supabase
        .from('rides')
        .update(updateData)
        .eq('id', rideId);
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Ride status updated!');
      queryClient.invalidateQueries({ queryKey: ['driver-rides'] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update ride status');
    },
  });

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveProfile.mutate({
      vehicle_type: vehicleType,
      vehicle_number: vehicleNumber,
      license_number: licenseNumber,
      is_available: true,
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'accepted': return 'bg-blue-100 text-blue-800';
      case 'in_progress': return 'bg-green-100 text-green-800';
      case 'completed': return 'bg-gray-100 text-gray-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return <div className="text-center">Loading...</div>;
  }

  if (!isProfileSetup) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Setup Driver Profile</CardTitle>
          <CardDescription>
            Complete your driver profile to start accepting rides
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="vehicle-type">Vehicle Type</Label>
              <Select value={vehicleType} onValueChange={(value: 'auto' | 'car' | 'bike') => setVehicleType(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border border-border z-50">
                  <SelectItem value="car">
                    <div className="flex items-center gap-2">
                      <Car className="h-4 w-4" />
                      Car
                    </div>
                  </SelectItem>
                  <SelectItem value="auto">
                    <div className="flex items-center gap-2">
                      <Truck className="h-4 w-4" />
                      Auto
                    </div>
                  </SelectItem>
                  <SelectItem value="bike">
                    <div className="flex items-center gap-2">
                      <Bike className="h-4 w-4" />
                      Bike
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="vehicle-number">Vehicle Number</Label>
              <Input
                id="vehicle-number"
                placeholder="Enter vehicle registration number"
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="license-number">License Number (Optional)</Label>
              <Input
                id="license-number"
                placeholder="Enter driving license number"
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={saveProfile.isPending}>
              {saveProfile.isPending ? 'Saving...' : 'Save Profile'}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <VehicleIcon type={driverProfile?.vehicle_type || 'car'} />
              Driver Status
            </div>
            <div className="flex items-center space-x-2">
              <Label htmlFor="availability">Available</Label>
              <Switch
                id="availability"
                checked={driverProfile?.is_available || false}
                onCheckedChange={(checked) => toggleAvailability.mutate(checked)}
              />
            </div>
          </CardTitle>
          <CardDescription>
            Vehicle: {driverProfile?.vehicle_type.toUpperCase()} - {driverProfile?.vehicle_number}
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Available Rides
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!driverProfile?.is_available ? (
            <p className="text-muted-foreground text-center py-8">
              Turn on availability to see ride requests
            </p>
          ) : availableRides.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No ride requests available for your vehicle type
            </p>
          ) : (
            <div className="space-y-4">
              {availableRides.map((ride) => (
                <div key={ride.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <VehicleIcon type={ride.vehicle_type} />
                      <span className="font-medium">{ride.vehicle_type.toUpperCase()}</span>
                    </div>
                    <Button 
                      size="sm"
                      onClick={() => acceptRide.mutate(ride.id)}
                      disabled={acceptRide.isPending}
                    >
                      Accept
                    </Button>
                  </div>
                  <div className="space-y-1 text-sm">
                    <p><strong>Customer:</strong> {ride.profiles?.full_name} ({ride.profiles?.phone})</p>
                    <p><strong>From:</strong> {ride.from_location}</p>
                    <p><strong>To:</strong> {ride.to_location}</p>
                    <p><strong>Pickup:</strong> {new Date(ride.pickup_time).toLocaleString()}</p>
                    {ride.notes && <p><strong>Notes:</strong> {ride.notes}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Your Rides
          </CardTitle>
        </CardHeader>
        <CardContent>
          {myRides.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No active rides</p>
          ) : (
            <div className="space-y-4">
              {myRides.map((ride) => (
                <RideCard 
                  key={ride.id} 
                  ride={ride} 
                  onUpdateStatus={updateRideStatus.mutate} 
                  isUpdating={updateRideStatus.isPending}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const RideCard = ({ ride, onUpdateStatus, isUpdating }: { 
  ride: Ride; 
  onUpdateStatus: (data: any) => void; 
  isUpdating: boolean;
}) => {
  const [distance, setDistance] = useState(ride.distance_km?.toString() || '');
  const [fare, setFare] = useState(ride.final_fare?.toString() || ride.estimated_fare?.toString() || '');

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'accepted': return 'bg-blue-100 text-blue-800';
      case 'in_progress': return 'bg-green-100 text-green-800';
      case 'completed': return 'bg-gray-100 text-gray-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handleStatusUpdate = (newStatus: string) => {
    if (newStatus === 'completed') {
      if (!distance || !fare) {
        toast.error('Please enter distance and fare before completing the ride');
        return;
      }
      onUpdateStatus({ 
        rideId: ride.id, 
        status: newStatus, 
        distance: parseFloat(distance), 
        fare: parseFloat(fare) 
      });
    } else {
      onUpdateStatus({ rideId: ride.id, status: newStatus });
    }
  };

  return (
    <div className="border rounded-lg p-4">
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          <VehicleIcon type={ride.vehicle_type} />
          <span className="font-medium">{ride.vehicle_type.toUpperCase()}</span>
        </div>
        <Badge className={getStatusColor(ride.status)}>
          {ride.status.replace('_', ' ').toUpperCase()}
        </Badge>
      </div>
      <div className="space-y-1 text-sm mb-4">
        <p><strong>Customer:</strong> {ride.profiles?.full_name} ({ride.profiles?.phone})</p>
        <p><strong>From:</strong> {ride.from_location}</p>
        <p><strong>To:</strong> {ride.to_location}</p>
        <p><strong>Pickup:</strong> {new Date(ride.pickup_time).toLocaleString()}</p>
        {ride.notes && <p><strong>Notes:</strong> {ride.notes}</p>}
      </div>

      {ride.status === 'accepted' && (
        <div className="space-y-2">
          <Button 
            size="sm" 
            onClick={() => handleStatusUpdate('in_progress')}
            disabled={isUpdating}
            className="w-full"
          >
            Start Ride
          </Button>
        </div>
      )}

      {ride.status === 'in_progress' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor={`distance-${ride.id}`}>Distance (km)</Label>
              <Input
                id={`distance-${ride.id}`}
                type="number"
                step="0.1"
                placeholder="0.0"
                value={distance}
                onChange={(e) => setDistance(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor={`fare-${ride.id}`}>Fare (₹)</Label>
              <Input
                id={`fare-${ride.id}`}
                type="number"
                step="0.01"
                placeholder="0.00"
                value={fare}
                onChange={(e) => setFare(e.target.value)}
              />
            </div>
          </div>
          <Button 
            size="sm" 
            onClick={() => handleStatusUpdate('completed')}
            disabled={isUpdating || !distance || !fare}
            className="w-full"
          >
            Complete Ride
          </Button>
        </div>
      )}
    </div>
  );
};

export default DriverDashboard;