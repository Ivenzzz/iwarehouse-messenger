/**
 * iWarehouse Messenger — demo seed
 * Idempotent: safe to run more than once (upserts by unique keys).
 * Run with: npm run db:seed
 */
import { ConversationType, PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const BRANCHES = [
  ['Bacolod Main', 'BCD-MAIN'],
  ['Bacolod 888', 'BCD-888'],
  ['Cadiz', 'CDZ'],
  ['Kabankalan', 'KBK'],
  ['Dumaguete', 'DGT'],
  ['La Carlota', 'LCR'],
  ['Silay', 'SLY'],
  ['Escalante', 'ESC'],
  ['Warehouse', 'WHS'],
  ['Head Office', 'HQ'],
] as const;

const DEPARTMENTS = [
  ['Management', 'MGMT'],
  ['Finance', 'FIN'],
  ['HR and Admin', 'HR'],
  ['Warehouse', 'WH'],
  ['RMA and Service', 'RMA'],
  ['E-commerce', 'ECOM'],
  ['Marketing', 'MKT'],
  ['Audit', 'AUD'],
  ['IT', 'IT'],
  ['Sales', 'SALES'],
  ['Cashiers', 'CASH'],
  ['Promoters', 'PROMO'],
  ['Logistics and Delivery', 'LOG'],
] as const;

interface SeedUser {
  email: string;
  username: string;
  displayName: string;
  title: string;
  role: Role;
  branch: string;
  department: string;
}

const USERS: SeedUser[] = [
  { email: 'michael.yap@iwarehouse.ph', username: 'michael.yap', displayName: 'Michael Yap', title: 'Super Admin', role: 'SUPER_ADMIN', branch: 'HQ', department: 'MGMT' },
  { email: 'jean.yap@iwarehouse.ph', username: 'jean.yap', displayName: 'Jean Yap', title: 'Finance Admin', role: 'ADMIN', branch: 'HQ', department: 'FIN' },
  { email: 'wh.supervisor@iwarehouse.ph', username: 'wh.supervisor', displayName: 'Warehouse Supervisor', title: 'Warehouse Supervisor', role: 'MANAGER', branch: 'WHS', department: 'WH' },
  { email: 'rma.specialist@iwarehouse.ph', username: 'rma.specialist', displayName: 'RMA Specialist', title: 'RMA Specialist', role: 'MEMBER', branch: 'HQ', department: 'RMA' },
  { email: 'auditor.one@iwarehouse.ph', username: 'auditor.one', displayName: 'Auditor One', title: 'Physical Auditor', role: 'MEMBER', branch: 'HQ', department: 'AUD' },
  { email: 'auditor.two@iwarehouse.ph', username: 'auditor.two', displayName: 'Auditor Two', title: 'Physical Auditor', role: 'MEMBER', branch: 'HQ', department: 'AUD' },
  { email: 'ecom.lead@iwarehouse.ph', username: 'ecom.lead', displayName: 'E-commerce Lead', title: 'E-commerce Lead', role: 'MANAGER', branch: 'HQ', department: 'ECOM' },
  { email: 'bacolod.oic@iwarehouse.ph', username: 'bacolod.oic', displayName: 'Bacolod OIC', title: 'Officer in Charge', role: 'MANAGER', branch: 'BCD-MAIN', department: 'SALES' },
  { email: 'cadiz.oic@iwarehouse.ph', username: 'cadiz.oic', displayName: 'Cadiz OIC', title: 'Officer in Charge', role: 'MANAGER', branch: 'CDZ', department: 'SALES' },
  { email: 'dumaguete.oic@iwarehouse.ph', username: 'dumaguete.oic', displayName: 'Dumaguete OIC', title: 'Officer in Charge', role: 'MANAGER', branch: 'DGT', department: 'SALES' },
  { email: 'hr.admin@iwarehouse.ph', username: 'hr.admin', displayName: 'HR Admin', title: 'HR Administrator', role: 'ADMIN', branch: 'HQ', department: 'HR' },
  { email: 'it.admin@iwarehouse.ph', username: 'it.admin', displayName: 'IT Admin', title: 'IT Administrator', role: 'ADMIN', branch: 'HQ', department: 'IT' },
];

interface SeedGroup {
  title: string;
  type: ConversationType;
  description: string;
  members: string[]; // usernames; first is owner
  messages?: [string, string][]; // [username, content]
}

const GROUPS: SeedGroup[] = [
  {
    title: 'iWarehouse Management',
    type: 'PRIVATE_GROUP',
    description: 'Leadership coordination across all branches.',
    members: ['michael.yap', 'jean.yap', 'hr.admin', 'it.admin'],
    messages: [
      ['michael.yap', 'Reminder: consolidated daily sales reports are due by 9:00 PM. OICs, please make sure your cashiers close out on time.'],
      ['jean.yap', 'Noted. Finance will flag any branch with unreconciled cash counts by tomorrow morning.'],
    ],
  },
  {
    title: 'Warehouse Operations',
    type: 'DEPARTMENT',
    description: 'Stock movement, receiving, dispatch, and transfer coordination.',
    members: ['wh.supervisor', 'michael.yap', 'bacolod.oic', 'cadiz.oic'],
    messages: [
      ['wh.supervisor', 'Stock transfer STO-2451 to Bacolod Main is loaded. 42 boxes, van leaves at 1:30 PM.'],
      ['bacolod.oic', 'Received the manifest. Please double-check the serials for the 10 units of the 55-inch TVs — last transfer had 2 mismatched serial numbers.'],
      ['wh.supervisor', 'Confirmed, serials re-scanned against the manifest. All 42 boxes match.'],
    ],
  },
  {
    title: 'Finance and Reconciliation',
    type: 'DEPARTMENT',
    description: 'Daily sales, remittances, and reconciliation issues.',
    members: ['jean.yap', 'michael.yap', 'bacolod.oic', 'cadiz.oic', 'dumaguete.oic'],
    messages: [
      ['jean.yap', 'Cadiz: yesterday\'s deposit slip shows ₱487,250 but the POS closing report shows ₱489,150. Please check for a missing ₱1,900.'],
      ['cadiz.oic', 'Checking now — likely the GCash refund that was processed after closing. Will send the reference number within the hour.'],
    ],
  },
  {
    title: 'RMA and Service',
    type: 'DEPARTMENT',
    description: 'Returns, repairs, and service escalations.',
    members: ['rma.specialist', 'michael.yap', 'ecom.lead'],
    messages: [
      ['rma.specialist', 'RMA-1088 (laptop, no power) is back from the service center — motherboard replaced under warranty. Ready for customer pickup at Bacolod Main.'],
      ['ecom.lead', 'Customer from the Shopee order RMA-1093 is following up. Any update on the replacement unit?'],
      ['rma.specialist', 'RMA-1093 replacement ships from Warehouse tomorrow, tracking to follow.'],
    ],
  },
  {
    title: 'Audit and Inventory Count',
    type: 'PROJECT',
    description: 'Quarterly physical count coordination and findings.',
    members: ['auditor.one', 'auditor.two', 'michael.yap', 'wh.supervisor'],
    messages: [
      ['auditor.one', 'Silay count complete. Finding: 3 units of powerbank SKU PB-20K in system but only 1 on shelf. Requesting CCTV review for the past 2 weeks.'],
      ['auditor.two', 'Escalante scheduled Thursday. Requesting the freeze on stock transfers to ESC starting Wednesday 6 PM.'],
      ['wh.supervisor', 'Transfer freeze for Escalante noted — no dispatches Wednesday evening onwards until your count clears.'],
    ],
  },
  {
    title: 'E-commerce Team',
    type: 'DEPARTMENT',
    description: 'Online orders, chat support, and marketplace operations.',
    members: ['ecom.lead', 'rma.specialist'],
    messages: [
      ['ecom.lead', 'Lazada flash sale starts Friday midnight. Please pre-pick the top 20 SKUs so dispatch isn\'t swamped Saturday morning.'],
    ],
  },
  {
    title: 'Bacolod Main Operations',
    type: 'BRANCH',
    description: 'Day-to-day operations for Bacolod Main.',
    members: ['bacolod.oic', 'michael.yap'],
    messages: [
      ['bacolod.oic', 'Aircon unit 2 on the sales floor is leaking again. Logging a maintenance request — customers are avoiding the TV aisle.'],
    ],
  },
  {
    title: 'Cadiz Operations',
    type: 'BRANCH',
    description: 'Day-to-day operations for Cadiz branch.',
    members: ['cadiz.oic', 'michael.yap'],
  },
  {
    title: 'Dumaguete Operations',
    type: 'BRANCH',
    description: 'Day-to-day operations for Dumaguete branch.',
    members: ['dumaguete.oic', 'michael.yap'],
    messages: [
      ['dumaguete.oic', 'Delivery concern: customer in Valencia reports the ref delivery is 2 days late. Logistics says the boat schedule moved. Please advise on a goodwill voucher.'],
    ],
  },
  {
    title: 'Company Announcements',
    type: 'ANNOUNCEMENT',
    description: 'Official company-wide announcements. Read and acknowledge.',
    members: USERS.map((u) => u.username),
    messages: [
      ['michael.yap', '📢 Inventory count week starts Monday. All branches: no stock transfers without warehouse supervisor approval until counts are cleared. Acknowledge by reacting ✅.'],
      ['hr.admin', '📢 HR reminder: submit your government ID updates to HR by end of month for the payroll system migration.'],
    ],
  },
  {
    title: 'ERP Development',
    type: 'PROJECT',
    description: 'ERP rollout coordination between IT and operations.',
    members: ['it.admin', 'michael.yap', 'jean.yap', 'wh.supervisor'],
    messages: [
      ['it.admin', 'ERP staging is up. Known issue: stock transfer module rounds quantities on split cartons. Fix targeted this sprint.'],
      ['jean.yap', 'Finance needs the reconciliation export in the next build — CSV with branch, date, POS total, deposit total, variance.'],
    ],
  },
  {
    title: 'Urgent Stock and Delivery Issues',
    type: 'INCIDENT',
    description: 'Escalation channel for missing stock and delivery emergencies.',
    members: ['michael.yap', 'wh.supervisor', 'bacolod.oic', 'cadiz.oic', 'dumaguete.oic', 'jean.yap'],
    messages: [
      ['bacolod.oic', '🚨 Missing serial: unit SN-88213-XK on the transfer STO-2447 manifest never arrived. System shows it in-transit for 5 days.'],
      ['wh.supervisor', 'Investigating. Van log shows the box count was short by 1 at dispatch. Pulling CCTV from the loading bay now.'],
      ['michael.yap', 'Keep this thread updated hourly until resolved. Jean, hold the insurance claim until we confirm it\'s not a scanning error.'],
    ],
  },
];

async function main() {
  console.log('Seeding iWarehouse Messenger…');

  // Branches and departments
  const branchByCode = new Map<string, string>();
  for (const [name, code] of BRANCHES) {
    const b = await prisma.branch.upsert({
      where: { code },
      update: { name },
      create: { name, code },
    });
    branchByCode.set(code, b.id);
  }
  const deptByCode = new Map<string, string>();
  for (const [name, code] of DEPARTMENTS) {
    const d = await prisma.department.upsert({
      where: { code },
      update: { name },
      create: { name, code },
    });
    deptByCode.set(code, d.id);
  }

  // Users — demo accounts share one password; the seed admin uses the env value.
  const demoPassword = process.env.SEED_DEMO_PASSWORD ?? 'iWarehouse!2026';
  const demoHash = await argon2.hash(demoPassword);
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMeNow!2026';
  const adminHash = await argon2.hash(adminPassword);

  const userIdByUsername = new Map<string, string>();
  for (const u of USERS) {
    const isSeedAdmin = u.role === 'SUPER_ADMIN';
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { role: u.role },
      create: {
        email: u.email,
        username: u.username,
        passwordHash: isSeedAdmin ? adminHash : demoHash,
        role: u.role,
        branchId: branchByCode.get(u.branch),
        departmentId: deptByCode.get(u.department),
        profile: { create: { displayName: u.displayName, title: u.title } },
      },
    });
    userIdByUsername.set(u.username, user.id);
  }

  // Groups + membership + sample messages
  for (const g of GROUPS) {
    const existing = await prisma.conversation.findFirst({
      where: { title: g.title, type: g.type },
    });
    if (existing) continue; // don't duplicate messages on re-seed

    const ownerId = userIdByUsername.get(g.members[0])!;
    const convo = await prisma.conversation.create({
      data: {
        type: g.type,
        title: g.title,
        description: g.description,
        createdById: ownerId,
        members: {
          create: g.members
            .filter((m) => userIdByUsername.has(m))
            .map((m, i) => ({
              userId: userIdByUsername.get(m)!,
              role:
                i === 0
                  ? 'OWNER'
                  : g.type === 'ANNOUNCEMENT'
                    ? 'READ_ONLY'
                    : 'MEMBER',
            })),
        },
      },
    });

    if (g.messages) {
      // Space messages a minute apart so ordering is stable and realistic.
      let t = Date.now() - g.messages.length * 60_000;
      for (const [username, content] of g.messages) {
        await prisma.message.create({
          data: {
            conversationId: convo.id,
            senderId: userIdByUsername.get(username),
            content,
            deliveryStatus: 'SENT',
            createdAt: new Date(t),
          },
        });
        t += 60_000;
      }
    }
  }

  // A sample direct message between the super admin and finance admin.
  const dmExists = await prisma.conversation.findFirst({
    where: { type: 'DIRECT', members: { some: { userId: userIdByUsername.get('michael.yap') } } },
  });
  if (!dmExists) {
    const dm = await prisma.conversation.create({
      data: {
        type: 'DIRECT',
        createdById: userIdByUsername.get('michael.yap'),
        members: {
          create: [
            { userId: userIdByUsername.get('michael.yap')!, role: 'MEMBER' },
            { userId: userIdByUsername.get('jean.yap')!, role: 'MEMBER' },
          ],
        },
      },
    });
    await prisma.message.create({
      data: {
        conversationId: dm.id,
        senderId: userIdByUsername.get('jean.yap'),
        content: 'Sending you the branch variance summary before the management call.',
      },
    });
  }

  await prisma.appSetting.upsert({
    where: { key: 'retention' },
    update: {},
    create: { key: 'retention', value: { messagesDays: 0, filesDays: 0 } }, // 0 = keep forever
  });

  console.log('Seed complete.');
  console.log(`  Super admin: ${process.env.SEED_ADMIN_EMAIL ?? 'michael.yap@iwarehouse.ph'} / (SEED_ADMIN_PASSWORD)`);
  console.log(`  Demo users:  <name>@iwarehouse.ph / ${demoPassword}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
