import type { ActivityKind, ActivityPublicDto } from './activity-definition.ts';

type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2) ? true : false;
type Expect<Value extends true> = Value;
type InteractionTypeFor<Kind extends ActivityKind> = Extract<
  ActivityPublicDto,
  { kind: Kind }
>['interaction']['type'];
type CategoriesFor<Kind extends ActivityKind> = Extract<
  ActivityPublicDto,
  { kind: Kind }
>['interaction'] extends { categories: infer Categories } ? Categories : never;
type FieldsFor<Kind extends ActivityKind> = Extract<
  ActivityPublicDto,
  { kind: Kind }
>['interaction'] extends { fields: infer Fields } ? Fields : never;
type HasAtLeastOne<Value> = Value extends [unknown, ...unknown[]] ? true : false;
type MaterialFor<Kind extends ActivityKind> = Extract<
  ActivityPublicDto,
  { kind: Kind }
>['materials'][number];

type _ScopeUsesClassificationBoard = Expect<Equal<
  InteractionTypeFor<'scope-classification'>,
  'classification-board'
>>;
type _EvidenceUsesClassificationBoard = Expect<Equal<
  InteractionTypeFor<'evidence-classification'>,
  'classification-board'
>>;
type _LinkUsesPurposeBuiltInteraction = Expect<Equal<
  InteractionTypeFor<'link-reconstruction'>,
  'sequence-builder' | 'candidate-link-review'
>>;
type _RecordUsesRecordForm = Expect<Equal<
  InteractionTypeFor<'structured-record'>,
  'record-form'
>>;
type _StateUsesStateMatrix = Expect<Equal<
  InteractionTypeFor<'four-state-judgement'>,
  'state-matrix'
>>;
type _RevisionUsesRevisionForm = Expect<Equal<
  InteractionTypeFor<'defective-sheet-revision'>,
  'revision-form'
>>;
type _ClassificationCategoriesAreNonEmpty = Expect<Equal<
  HasAtLeastOne<CategoriesFor<'scope-classification'>>,
  true
>>;
type _StateCategoriesAreNonEmpty = Expect<Equal<
  HasAtLeastOne<CategoriesFor<'four-state-judgement'>>,
  true
>>;
type _RecordFieldsAreNonEmpty = Expect<Equal<
  HasAtLeastOne<FieldsFor<'structured-record'>>,
  true
>>;
type _RevisionFieldsAreNonEmpty = Expect<Equal<
  HasAtLeastOne<FieldsFor<'defective-sheet-revision'>>,
  true
>>;
type _RevisionMaterialsRequireSourceValue = Expect<
  MaterialFor<'defective-sheet-revision'> extends { sourceValue: string } ? true : false
>;

export {};
