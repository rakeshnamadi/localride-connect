import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { MapPin, Clock, Car, Bike, Truck } from 'lucide-react';

interface Location {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
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
  driver_id: string;
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

const CustomerDashboard = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [fromLocation, setFromLocation] = useState('');
  const [toLocation, setToLocation] = useState('');
  const [pickupTime, setPickupTime] = useState('');
  const [vehicleType, setVehicleType] = useState<'auto' | 'car' | 'bike'>('car');
  const [notes, setNotes] = useState('');

  // Fetch user's rides
  const { data: rides = [] } = useQuery({
    queryKey: ['customer-rides'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rides')
        .select(`
          *,
          profiles!rides_driver_id_fkey(full_name, phone)
        `)
        .eq('customer_id', user?.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Ride[];
    },
  });

  // Create ride mutation
  const createRide = useMutation({
    mutationFn: async (rideData: any) => {
      const { data, error } = await supabase.functions.invoke('create-ride', {
        body: rideData
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Ride request created successfully!');
      queryClient.invalidateQueries({ queryKey: ['customer-rides'] });
      // Reset form
      setFromLocation('');
      setToLocation('');
      setPickupTime('');
      setNotes('');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create ride request');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!fromLocation || !toLocation || !pickupTime) {
      toast.error('Please fill in all required fields');
      return;
    }

    createRide.mutate({
      from_location: fromLocation,
      to_location: toLocation,
      pickup_time: pickupTime,
      vehicle_type: vehicleType,
      notes: notes || null,
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Book a Ride
          </CardTitle>
          <CardDescription>
            Request a ride by filling in your pickup and destination details
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="from">From Location</Label>
                <Input
                  id="from"
                  placeholder="Enter pickup address"
                  value={fromLocation}
                  onChange={(e) => setFromLocation(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="to">To Location</Label>
                <Input
                  id="to"
                  placeholder="Enter destination address"
                  value={toLocation}
                  onChange={(e) => setToLocation(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pickup-time">Pickup Time</Label>
                <Input
                  id="pickup-time"
                  type="datetime-local"
                  value={pickupTime}
                  onChange={(e) => setPickupTime(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vehicle">Vehicle Type</Label>
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Additional Notes (Optional)</Label>
              <Textarea
                id="notes"
                placeholder="Any special instructions for the driver"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>

            <Button 
              type="submit" 
              className="w-full"
              disabled={createRide.isPending}
            >
              {createRide.isPending ? 'Booking...' : 'Book Ride'}
            </Button>
          </form>
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
          {rides.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No rides found. Book your first ride above!</p>
          ) : (
            <div className="space-y-4">
              {rides.map((ride) => (
                <div key={ride.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <VehicleIcon type={ride.vehicle_type} />
                      <span className="font-medium">{ride.vehicle_type.toUpperCase()}</span>
                    </div>
                    <Badge className={getStatusColor(ride.status)}>
                      {ride.status.replace('_', ' ').toUpperCase()}
                    </Badge>
                  </div>
                  <div className="space-y-1 text-sm">
                    <p><strong>From:</strong> {ride.from_location}</p>
                    <p><strong>To:</strong> {ride.to_location}</p>
                    <p><strong>Pickup:</strong> {new Date(ride.pickup_time).toLocaleString()}</p>
                    {ride.distance_km && <p><strong>Distance:</strong> {ride.distance_km} km</p>}
                    {ride.estimated_fare && <p><strong>Fare:</strong> ₹{ride.final_fare || ride.estimated_fare}</p>}
                    {ride.profiles && (
                      <p><strong>Driver:</strong> {ride.profiles.full_name} ({ride.profiles.phone})</p>
                    )}
                    {ride.notes && <p><strong>Notes:</strong> {ride.notes}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CustomerDashboard;