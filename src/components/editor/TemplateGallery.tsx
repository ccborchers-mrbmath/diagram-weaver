import { useState } from "react";
import { ArrowLeft, Shapes } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  TEMPLATES,
  coerceParams,
  defaultParams,
  renderTemplate,
  type ParamSpec,
  type ParamValues,
  type Template,
} from "@/lib/svg/templates";

type Props = {
  onRender: (svg: string) => void;
};

export function TemplateGallery({ onRender }: Props) {
  const [selected, setSelected] = useState<Template | null>(null);

  if (selected) {
    return (
      <TemplateEditor template={selected} onBack={() => setSelected(null)} onRender={onRender} />
    );
  }

  const byCategory = groupByCategory(TEMPLATES);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Computed, exam-accurate figures. Pick one, then edit its values — the geometry stays correct
        automatically.
      </p>
      {byCategory.map(([category, items]) => (
        <div key={category} className="flex flex-col gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {category}
          </h3>
          <div className="flex flex-col gap-2">
            {items.map((tpl) => (
              <button
                key={tpl.id}
                onClick={() => {
                  setSelected(tpl);
                  onRender(renderTemplate(tpl.id, {}));
                }}
                className="group flex items-start gap-3 rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-primary hover:bg-accent"
              >
                <Shapes className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{tpl.name}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {tpl.description}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TemplateEditor({
  template,
  onBack,
  onRender,
}: {
  template: Template;
  onBack: () => void;
  onRender: (svg: string) => void;
}) {
  const [values, setValues] = useState<ParamValues>(() => defaultParams(template));

  const update = (key: string, value: number | string | boolean) => {
    const next = { ...values, [key]: value };
    setValues(next);
    onRender(renderTemplate(template.id, coerceParams(template, next)));
  };

  return (
    <div className="flex flex-col gap-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 self-start text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All templates
      </button>

      <div>
        <h2 className="text-sm font-semibold">{template.name}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{template.description}</p>
      </div>

      <div className="flex flex-col gap-3">
        {template.params.map((spec) => (
          <ParamField
            key={spec.key}
            spec={spec}
            value={values[spec.key]}
            onChange={(v) => update(spec.key, v)}
          />
        ))}
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          const d = defaultParams(template);
          setValues(d);
          onRender(renderTemplate(template.id, d));
        }}
      >
        Reset to defaults
      </Button>
    </div>
  );
}

function ParamField({
  spec,
  value,
  onChange,
}: {
  spec: ParamSpec;
  value: number | string | boolean;
  onChange: (v: number | string | boolean) => void;
}) {
  const id = `param-${spec.key}`;

  if (spec.type === "boolean") {
    return (
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id} className="text-xs font-medium">
          {spec.label}
        </Label>
        <Switch id={id} checked={Boolean(value)} onCheckedChange={(c) => onChange(c)} />
      </div>
    );
  }

  if (spec.type === "select") {
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id} className="text-xs font-medium">
          {spec.label}
        </Label>
        <select
          id={id}
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {spec.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  const isNumber = spec.type === "number" || spec.type === "integer";
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs font-medium">
        {spec.label}
      </Label>
      <Input
        id={id}
        type={isNumber ? "number" : "text"}
        value={value as string | number}
        min={isNumber ? spec.min : undefined}
        max={isNumber ? spec.max : undefined}
        step={isNumber ? (spec.type === "integer" ? 1 : (spec.step ?? "any")) : undefined}
        onChange={(e) => onChange(isNumber ? Number(e.target.value) : e.target.value)}
      />
    </div>
  );
}

// Group templates by category, preserving first-appearance order.
function groupByCategory(templates: Template[]): [string, Template[]][] {
  const map = new Map<string, Template[]>();
  for (const tpl of templates) {
    const list = map.get(tpl.category) ?? [];
    list.push(tpl);
    map.set(tpl.category, list);
  }
  return Array.from(map.entries());
}
