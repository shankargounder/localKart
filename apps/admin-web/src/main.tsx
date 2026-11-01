import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, NavLink, useLocation } from "react-router-dom";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import {
  ConfigProvider,
  Button,
  Card,
  Input,
  Form,
  Table,
  Tag,
  Alert,
  Modal,
  Space,
  Statistic,
  Spin,
  message,
} from "antd";
import { money } from "@localkart/shared";
import "./style.css";
import { colors } from "@localkart/design-tokens";
import { V2Workspace, v2Sections } from "./V2";
for (const [key, value] of Object.entries(colors))
  document.documentElement.style.setProperty("--" + key, value);
const client = new QueryClient();
let session: any = null;
const base = import.meta.env.VITE_API_URL || "http://localhost:4000/api/v1";
let refresh: Promise<void> | null = null;
async function api(
  path: string,
  method = "GET",
  body?: any,
  retry = true,
): Promise<any> {
  const r = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: "Bearer " + session.accessToken } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401 && session && retry) {
    refresh ??= fetch(base + "/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    })
      .then(async (result) => {
        if (!result.ok) throw new Error("Session expired. Log in again.");
        session = await result.json();
      })
      .finally(() => {
        refresh = null;
      });
    await refresh;
    return api(path, method, body, false);
  }
  const data = r.status === 204 ? null : await r.json();
  if (!r.ok) throw new Error(data.message || "Request failed");
  return data;
}
function App() {
  const [user, setUser] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const { pathname } = useLocation();
  const section = pathname.slice(1) || "dashboard";
  const path =
    (
      {
        dashboard: "/admin/dashboard",
        shops: "/admin/shops",
        users: "/admin/users",
        orders: "/orders",
        products: "/admin/products",
        inventory: "/admin/inventory-anomalies",
        categories: "/categories",
      } as Record<string, string>
    )[section] || "/admin/dashboard";
  const result = useQuery({
    queryKey: [path],
    queryFn: () => api(path),
    enabled: !!user && !v2Sections.includes(section),
    refetchInterval: 15000,
  });
  const mutate = async (path: string, method = "POST", body?: any) => {
    try {
      await api(path, method, body);
      await client.invalidateQueries();
      message.success("Saved");
    } catch (e) {
      message.error((e as Error).message);
    }
  };
  if (!user)
    return (
      <div className="login">
        <div className="login-story">
          <div className="logo">
            LocalKart<span>●</span>
          </div>
          <span className="eyebrow">MARKETPLACE OPERATIONS</span>
          <h1>
            Stronger shops.
            <br />
            Happier neighbourhoods.
          </h1>
          <p>One workspace to help your local market thrive.</p>
          <div className="story-art">
            🏪 <span>🥬</span> 🛍️
          </div>
        </div>
        <Card className="login-card">
          <span className="eyebrow">WELCOME BACK</span>
          <h2>Sign in to your workspace</h2>
          <p className="muted">Use your administrator account to continue.</p>
          {error && <Alert type="error" message={error} />}
          <Form
            layout="vertical"
            onFinish={async (values) => {
              setLoading(true);
              try {
                const data = await api("/auth/login", "POST", values);
                if (data.user.role !== "ADMIN")
                  throw new Error("Administrator account required");
                session = data;
                setUser(data.user);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setLoading(false);
              }
            }}
          >
            <Form.Item
              label="Email address"
              name="email"
              rules={[{ required: true, type: "email" }]}
            >
              <Input size="large" placeholder="admin@example.com" />
            </Form.Item>
            <Form.Item
              label="Password"
              name="password"
              rules={[{ required: true }]}
            >
              <Input.Password size="large" />
            </Form.Item>
            <Button
              loading={loading}
              type="primary"
              htmlType="submit"
              block
              size="large"
            >
              Sign in
            </Button>
          </Form>
          <p className="muted">
            Restricted access · Administrator accounts only
          </p>
        </Card>
      </div>
    );
  const columns: any =
    section === "shops"
      ? [
          { title: "Shop", dataIndex: "name" },
          { title: "Category", render: (_: any, r: any) => r.category.name },
          {
            title: "Status",
            dataIndex: "approval",
            render: (v: string) => (
              <Tag color={v === "APPROVED" ? "green" : "orange"}>{v}</Tag>
            ),
          },
          {
            title: "Actions",
            render: (_: any, r: any) => (
              <Space>
                <Button
                  onClick={() => void mutate(`/admin/shops/${r.id}/approve`)}
                >
                  Approve
                </Button>
                <Button
                  danger
                  onClick={() => void mutate(`/admin/shops/${r.id}/suspend`)}
                >
                  Suspend
                </Button>
                <Button
                  onClick={() => void mutate(`/admin/shops/${r.id}/reject`)}
                >
                  Reject
                </Button>
              </Space>
            ),
          },
        ]
      : section === "users"
        ? [
            { title: "Name", dataIndex: "name" },
            { title: "Email", dataIndex: "email" },
            { title: "Role", dataIndex: "role" },
            {
              title: "Status",
              render: (_: any, r: any) =>
                r.suspended ? "Suspended" : "Active",
            },
            {
              title: "Action",
              render: (_: any, r: any) =>
                r.role !== "ADMIN" && (
                  <Button
                    onClick={() =>
                      void mutate("/admin/users/" + r.id, "PATCH", {
                        suspended: !r.suspended,
                      })
                    }
                  >
                    {r.suspended ? "Reactivate" : "Suspend"}
                  </Button>
                ),
            },
          ]
        : section === "orders"
          ? [
              {
                title: "Order",
                render: (_: any, r: any) => "#" + r.id.slice(0, 8),
              },
              { title: "Shop", render: (_: any, r: any) => r.shop.name },
              {
                title: "State",
                dataIndex: "status",
                render: (v: string) => <Tag>{v.replaceAll("_", " ")}</Tag>,
              },
              { title: "Amount", dataIndex: "totalPaise", render: money },
              {
                title: "Payment",
                render: (_: any, r: any) => r.payment?.status,
              },
              {
                title: "Details",
                render: (_: any, r: any) => (
                  <Button onClick={() => setSelected(r)}>Inspect</Button>
                ),
              },
            ]
          : section === "products"
            ? [
                { title: "Product", dataIndex: "name" },
                { title: "Shop", render: (_: any, r: any) => r.shop.name },
                {
                  title: "Active",
                  render: (_: any, r: any) => (r.active ? "Yes" : "No"),
                },
                {
                  title: "Moderate",
                  render: (_: any, r: any) => (
                    <Button
                      onClick={() =>
                        void mutate("/admin/products/" + r.id, "PATCH", {
                          active: !r.active,
                        })
                      }
                    >
                      {r.active ? "Hide" : "Restore"}
                    </Button>
                  ),
                },
              ]
            : section === "categories"
              ? [{ title: "Category", dataIndex: "name" }]
              : [
                  { title: "Variant", dataIndex: "variantId" },
                  { title: "On hand", dataIndex: "onHand" },
                  { title: "Reserved", dataIndex: "reserved" },
                ];
  return (
    <div className="shell">
      <aside>
        <div className="logo">
          LocalKart<span>●</span>
        </div>
        <p className="eyebrow">OPERATIONS CONSOLE</p>
        <nav>
          {[
            "dashboard",
            "shops",
            "orders",
            "products",
            "users",
            "categories",
            "inventory",
            "deliveries",
            "commissions",
            "support",
            "refunds",
            "notifications",
            "analytics",
          ].map((item) => (
            <NavLink
              key={item}
              to={"/" + item}
              className={section === item ? "active" : ""}
            >
              {
                (
                  {
                    dashboard: "◈  Overview",
                    shops: "⌂  Local shops",
                    orders: "▤  Pickup orders",
                    products: "▦  Product catalogue",
                    users: "♧  People",
                    categories: "☷  Categories",
                    inventory: "◇  Inventory health",
                    deliveries: "⇢  Delivery dispatch",
                    commissions: "%  Commissions",
                    support: "?  Support",
                    refunds: "↶  Refunds",
                    notifications: "♧  Notifications",
                    analytics: "▥  Analytics",
                  } as any
                )[item]
              }
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="avatar">{user.name[0]}</div>
          <strong>{user.name}</strong>
          <p>Administrator</p>
          <Button
            onClick={async () => {
              try {
                await api("/auth/logout", "POST", {
                  refreshToken: session.refreshToken,
                });
              } finally {
                session = null;
                setUser(null);
                client.clear();
              }
            }}
          >
            Sign out
          </Button>
        </div>
      </aside>
      <main>
        <header>
          <span>
            Marketplace / <b>{section}</b>
          </span>
          <span className="live">● Live workspace</span>
        </header>
        <div className="content">
          <span className="eyebrow">LOCAL COMMERCE, CONNECTED</span>
          <h1>
            {section === "dashboard"
              ? "Your marketplace at a glance"
              : (
                  {
                    shops: "The shops behind your neighbourhood",
                    orders: "Every pickup, in view",
                    products: "A catalogue worth exploring",
                    users: "Your LocalKart community",
                    categories: "Organise your local market",
                    inventory: "Healthy stock, reliable pickups",
                    deliveries: "Coordinate deliveries with confidence",
                    commissions: "Clear fees, immutable snapshots",
                    support: "Resolve customer and merchant issues",
                    refunds: "Track every refund request",
                    notifications: "Notification delivery monitoring",
                    analytics: "Know your marketplace numbers",
                  } as any
                )[section]}
          </h1>
          <p className="muted">
            {section === "dashboard"
              ? "A clear picture of the people, shops, and orders moving your market."
              : "Manage marketplace records. Changes are saved to the LocalKart API."}
          </p>
          {result.error && (
            <Alert
              type="error"
              message={(result.error as Error).message}
              action={<Button onClick={() => result.refetch()}>Retry</Button>}
            />
          )}{" "}
          {v2Sections.includes(section) ? (
            <V2Workspace section={section} api={api} />
          ) : result.isLoading ? (
            <Spin />
          ) : section === "dashboard" && result.data ? (
            <>
              <div className="stats">
                {Object.entries(result.data).map(([k, v]) => (
                  <Card key={k}>
                    <Statistic
                      title={
                        k === "salesPaise"
                          ? "Completed order value"
                          : k[0].toUpperCase() + k.slice(1)
                      }
                      value={k === "salesPaise" ? money(Number(v)) : Number(v)}
                    />
                    <span className="stat-foot">Live marketplace total</span>
                  </Card>
                ))}
              </div>
              <div className="overview-grid">
                <Card title="Make local shopping feel effortless">
                  <div className="feature">
                    <span className="eyebrow">GROWING TOGETHER</span>
                    <h2>
                      A little closer.
                      <br />A lot more local.
                    </h2>
                    <p>
                      Approve trusted shops, monitor pickups, and help your
                      community shop with confidence.
                    </p>
                    <NavLink to="/shops">
                      <Button type="primary">Review local shops →</Button>
                    </NavLink>
                  </div>
                </Card>
                <Card title="Operations checklist">
                  <p>① Review pending shop applications</p>
                  <p>② Follow orders awaiting acceptance</p>
                  <p>③ Check catalogue availability</p>
                  <p>④ Monitor inventory health</p>
                  <Alert
                    type="info"
                    message="Pickup & pilot delivery"
                    description="Delivery requires merchant opt-in, a valid quote and verified fulfillment."
                  />
                </Card>
              </div>
            </>
          ) : (
            <Card>
              {section === "categories" && (
                <Space style={{ marginBottom: 20 }}>
                  <Input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="New category name"
                  />
                  <Button
                    type="primary"
                    onClick={() =>
                      void mutate("/admin/categories", "POST", {
                        name: category,
                      })
                    }
                  >
                    Add category
                  </Button>
                </Space>
              )}
              <Table
                rowKey={(r) => r.id || r.variantId}
                dataSource={Array.isArray(result.data) ? result.data : []}
                columns={columns}
                scroll={{ x: true }}
                pagination={{ pageSize: 10 }}
                locale={{
                  emptyText:
                    section === "inventory"
                      ? "No inventory anomalies found"
                      : "No records yet",
                }}
              />
            </Card>
          )}
          <footer>LocalKart · Your local market, one app</footer>
        </div>
      </main>
      <Modal
        title="Order details"
        open={!!selected}
        onCancel={() => setSelected(null)}
        footer={null}
      >
        {selected && (
          <>
            <p>#{selected.id}</p>
            <p>
              {selected.shop.name} · {selected.status}
            </p>
            {selected.items.map((i: any) => (
              <p key={i.id}>
                {i.quantity / 1000} × {i.name} — {money(i.totalPaise)}
              </p>
            ))}
            <h3>{money(selected.totalPaise)}</h3>
            {selected.history.map((h: any) => (
              <p key={h.id}>
                {h.status} · {new Date(h.createdAt).toLocaleString("en-IN")}
              </p>
            ))}
          </>
        )}
      </Modal>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: colors.primary,
          colorTextLightSolid: colors.text,
          colorText: colors.text,
          colorInfo: colors.text,
          borderRadius: 12,
          fontFamily: "Inter, system-ui, sans-serif",
          colorBgLayout: colors.surface,
        },
      }}
    >
      <QueryClientProvider client={client}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ConfigProvider>
  </React.StrictMode>,
);
