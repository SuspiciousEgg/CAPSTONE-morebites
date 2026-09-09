import { createContext, useState, useContext } from 'react';

// Context for managing drivers globally across supervisor pages
const DriverContext = createContext(null);

// Format driver ID like DRIVER-001
const formatDriverId = (num) => `DRIVER-${String(num).padStart(3, '0')}`;

const INITIAL_DRIVERS = [
  {
    id: 1,
    driverId: 'DRIVER-001',
    name: '1 John Rider',
    phone: '+63 912 345 6789',
    status: 'active',
    vehicleType: 'Motorcycle HONDA CLICK',
  },
  {
    id: 2,
    driverId: 'DRIVER-002',
    name: '2 Ghost Rider',
    phone: '+63 912 379 5432',
    status: 'active',
    vehicleType: 'Motorcycle Yamaha Mio',
  },
  {
    id: 3,
    driverId: 'DRIVER-003',
    name: '3 Johnny Klebitz',
    phone: '+63 912 913 2222',
    status: 'active',
    vehicleType: 'Motorcycle Kawasaki',
  },
];

export function DriverProvider({ children }) {
  // Global drivers array state
  const [drivers, setDrivers] = useState(INITIAL_DRIVERS);
  const [driverCounter, setDriverCounter] = useState(4);

  // Add a new driver with auto-generated id and driverId
  const addDriver = (driverData) => {
    const generatedId = Date.now() + Math.floor(Math.random() * 1000);
    const assignedDriverId = driverData.driverId || formatDriverId(driverCounter);

    const newDriver = {
      id: generatedId,
      driverId: assignedDriverId,
      name: driverData.name || '',
      phone: driverData.phone || '',
      email: driverData.email || '',
      licenseNumber: driverData.licenseNumber || '',
      vehicleType: driverData.vehicleType || '',
      licenseExpiry: driverData.licenseExpiry || '',
      customerRating: driverData.customerRating ?? 0,
      status: driverData.status || 'active',
      totalDeliveries: driverData.totalDeliveries ?? 0,
      onTimeDelivery: driverData.onTimeDelivery ?? 0,
      cancellations: driverData.cancellations ?? 0,
      reviews: driverData.reviews || [],
      notes: driverData.notes || '',
    };

    setDrivers((prev) => [...prev, newDriver]);
    setDriverCounter((prev) => prev + 1);
    return newDriver;
  };

  // Replace/update an existing driver by id
  const updateDriver = (id, updatedDriver) => {
    setDrivers((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...updatedDriver } : d))
    );
  };

  // Update only the driver status ('active' | 'inactive')
  const updateDriverStatus = (id, status) => {
    setDrivers((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status } : d))
    );
  };

  return (
    <DriverContext.Provider
      value={{
        drivers,
        addDriver,
        updateDriver,
        updateDriverStatus,
      }}
    >
      {children}
    </DriverContext.Provider>
  );
}

// Custom hook for consuming driver context
export function useDriver() {
  return useContext(DriverContext);
}
