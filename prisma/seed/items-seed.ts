import { PrismaClient, categories } from '@prisma/client';

const prisma = new PrismaClient();
export async function ItemsSeed() {
  const categories = await prisma.categories.findMany();
  console.log(categories);

  const item = [
    {
      name: 'Circuit Breaker',
      service_name: 'jasa pasang Circuit Breaker',
      category: 'electrical and lighting',
    },
    {
      name: 'Conduit',
      service_name: 'jasa pasang Conduit',
      category: 'electrical and lighting',
    },
    {
      name: 'Electrical Boxes',
      service_name: 'jasa pasang Electrical Boxes',
      category: 'electrical and lighting',
    },
    {
      name: 'Electrical Outlets',
      service_name: 'jasa pasang Electrical Outlets',
      category: 'electrical and lighting',
    },
    {
      name: 'Electrical Switches',
      service_name: 'jasa pasang Electrical Switches',
      category: 'electrical and lighting',
    },
    {
      name: 'Grounding System',
      service_name: 'jasa pasang Grounding System:',
      category: 'electrical and lighting',
    },
    {
      name: 'Light Fixture',
      service_name: 'jasa pasang Light Fixture',
      category: 'electrical and lighting',
    },
    {
      name: 'Light Switches',
      service_name: 'jasa pasang Light Switches',
      category: 'electrical and lighting',
    },
    {
      name: 'Receptacles',
      service_name: 'jasa pasang Receptacles',
      category: 'electrical and lighting',
    },
    {
      name: 'Service Entrance',
      service_name: 'jasa pasang Service Entrance',
      category: 'electrical and lighting',
    },
    {
      name: 'Service Panel',
      service_name: 'jasa pasang Service Panel',
      category: 'electrical and lighting',
    },
    {
      name: 'Smoke Detectors',
      service_name: 'jasa pasang Smoke Detectors',
      category: 'electrical and lighting',
    },
    {
      name: 'Surge Protectors',
      service_name: 'jasa pasang Surge Protectors',
      category: 'electrical and lighting',
    },
    {
      name: 'Wiring',
      service_name: 'jasa pasang Wiring',
      category: 'electrical and lighting',
    },
    {
      name: 'Dimmer Switches',
      service_name: 'jasa pasang Dimmer Switches',
      category: 'electrical and lighting',
    },
    {
      name: 'Ceiling Fans',
      service_name: 'jasa pasang Ceiling Fans',
      category: 'appliances',
    },
    {
      name: 'Exhaust Fans',
      service_name: 'jasa pasang Exhaust Fans',
      category: 'appliances',
    },
    {
      name: 'Smart Thermostats',
      service_name: 'jasa pasang Smart Thermostats',
      category: 'electrical and lighting',
    },
    {
      name: 'Electric Water Heater',
      service_name: 'jasa pasang Electric Water Heater',
      category: 'appliances',
    },
    {
      name: 'Electric Range',
      service_name: 'jasa pasang Electric Range',
      category: 'appliances',
    },
    {
      name: 'Gas stove',
      service_name: 'jasa pasang Gas stove',
      category: 'electrical and lighting',
    },
    {
      name: 'solar panel',
      service_name: 'jasa pasang solar panel',
      category: 'flooring',
    },
    {
      name: 'ubin',
      service_name: 'jasa pasang ubin',
      category: 'roof',
    },
    {
      name: 'atap baja ringan',
      service_name: 'jasa pasang atap baja ringan',
      category: 'appliances',
    },
    {
      name: 'microwave tempel',
      service_name: 'jasa pasang microwave tempel',
      category: 'electrical and lighting',
    },
    {
      name: 'smart switch',
      service_name: 'jasa pasang smart switch',
      category: 'appliances',
    },
    {
      name: 'cctv',
      service_name: 'jasa pasang cctv',
      category: 'sanitary',
    },
    {
      name: 'wastafel',
      service_name: 'jasa pasang wastafel',
      category: 'sanitary',
    },
    {
      name: 'kloset',
      service_name: 'jasa pasang kloset',
      category: 'sanitary',
    },
    {
      name: 'shower',
      service_name: 'jasa pasang shower',
      category: 'sanitary',
    },
    {
      name: 'bathtub',
      service_name: 'jasa pasang bathtub',
      category: 'electrical and lighting',
    },
    {
      name: 'pagar otomatis',
      service_name: 'jasa pasang pagar otomatis',
      category: 'electrical and lighting',
    },
    {
      name: 'smart blind',
      service_name: 'jasa pasang smart blind',
      category: 'electrical and lighting',
    },
    {
      name: 'bell rumah',
      service_name: 'jasa pasang bell rumah',
      category: 'electrical and lighting',
    },
  ];

  await prisma.items.createMany({
    data: item.map((x) => ({
      item_name: x.name,
      service_name: x.service_name,
      category_id:
        categories.find((y) =>
          y.category_name.toLowerCase().includes(x.category.toLowerCase()),
        )?.id ??
        categories.find((y) => y.category_name.toLowerCase().includes('other'))
          ?.id,
    })),
  });
}
