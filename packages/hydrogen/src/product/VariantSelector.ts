import {useLocation} from '@remix-run/react';
import {flattenConnection} from '@shopify/hydrogen-react';
import type {
  Product,
  ProductOption,
  ProductVariant,
  ProductVariantConnection,
  SelectedOptionInput,
} from '@shopify/hydrogen-react/storefront-api-types';
import {ReactNode, useMemo, createElement, Fragment} from 'react';
import type {PartialDeep} from 'type-fest';

export type VariantOption = {
  name: string;
  value?: string;
  values: Array<VariantOptionValue>;
};

export type VariantOptionValue = {
  value: string;
  isAvailable: boolean;
  to: string;
  search: string;
  isActive: boolean;
};

type VariantSelectorProps = {
  /** The product handle for all of the variants */
  handle: string;
  /** Product options from the [Storefront API](/docs/api/storefront/2023-04/objects/ProductOption). Make sure both `name` and `values` are apart of your query. */
  options: Array<PartialDeep<ProductOption>> | undefined;
  /** Product variants from the [Storefront API](/docs/api/storefront/2023-04/objects/ProductVariant). You only need to pass this prop if you want to show product availability. If a product option combination is not found within `variants`, it is assumed to be available. Make sure to include `availableForSale` and `selectedOptions.name` and `selectedOptions.value`. */
  variants?:
    | PartialDeep<ProductVariantConnection>
    | Array<PartialDeep<ProductVariant>>;
  /** Provide a default variant when no options are selected. You can use the utility `getFirstAvailableVariant` to get a default variant. */
  defaultVariant?: PartialDeep<ProductVariant>;
  children: ({option}: {option: VariantOption}) => ReactNode;
};

export function VariantSelector({
  handle,
  options = [],
  variants: _variants = [],
  children,
  defaultVariant,
}: VariantSelectorProps) {
  const variants =
    _variants instanceof Array ? _variants : flattenConnection(_variants);

  const {searchParams, path, alreadyOnProductPage} = useVariantPath(handle);

  // If an option only has one value, it doesn't need a UI to select it
  // But instead it always needs to be added to the product options so
  // the SFAPI properly finds the variant
  const optionsWithOnlyOneValue = options.filter(
    (option) => option?.values?.length === 1,
  );

  return createElement(
    Fragment,
    null,
    ...useMemo(() => {
      return (
        options
          // Only show options with more than one value
          .filter((option) => option?.values?.length! > 1)
          .map((option) => {
            let activeValue;
            let availableValues: VariantOptionValue[] = [];

            for (let value of option.values!) {
              // The clone the search params for each value, so we can calculate
              // a new URL for each option value pair
              const clonedSearchParams = new URLSearchParams(
                alreadyOnProductPage ? searchParams : undefined,
              );
              clonedSearchParams.set(option.name!, value!);

              // Because we hide options with only one value, they aren't selectable,
              // but they still need to get into the URL
              optionsWithOnlyOneValue.forEach((option) => {
                clonedSearchParams.set(option.name!, option.values![0]!);
              });

              // Find a variant that matches all selected options.
              const variant = variants.find((variant) =>
                variant?.selectedOptions?.every(
                  (selectedOption) =>
                    clonedSearchParams.get(selectedOption?.name!) ===
                    selectedOption?.value,
                ),
              );

              const currentParam = searchParams.get(option.name!);

              const calculatedActiveValue = currentParam
                ? // If a URL parameter exists for the current option, check if it equals the current value
                  currentParam === value!
                : defaultVariant
                ? // Else check if the default variant has the current option value
                  defaultVariant.selectedOptions?.some(
                    (selectedOption) =>
                      selectedOption?.name === option.name &&
                      selectedOption?.value === value,
                  )
                : false;

              if (calculatedActiveValue) {
                // Save out the current value if it's active. This should only ever happen once.
                // Should we throw if it happens a second time?
                activeValue = value;
              }

              const searchString = '?' + clonedSearchParams.toString();

              availableValues.push({
                value: value!,
                isAvailable: variant ? variant.availableForSale! : true,
                to: path + searchString,
                search: searchString,
                isActive: Boolean(calculatedActiveValue),
              });
            }

            return children({
              option: {
                name: option.name!,
                value: activeValue,
                values: availableValues,
              },
            });
          })
      );
    }, [options, variants, children]),
  );
}

type GetSelectedProductOptions = (request: Request) => SelectedOptionInput[];

export const getSelectedProductOptions: GetSelectedProductOptions = (
  request,
) => {
  if (!(request instanceof Request))
    throw new TypeError(`Expected a Request instance, got ${typeof request}`);

  const searchParams = new URL(request.url).searchParams;

  const selectedOptions: SelectedOptionInput[] = [];

  searchParams.forEach((value, name) => {
    selectedOptions.push({name, value});
  });

  return selectedOptions;
};

type GetFirstAvailableVariant = (
  variants:
    | PartialDeep<ProductVariantConnection>
    | Array<PartialDeep<ProductVariant>>,
) => PartialDeep<ProductVariant> | undefined;

export const getFirstAvailableVariant: GetFirstAvailableVariant = (
  variants:
    | PartialDeep<ProductVariantConnection>
    | Array<PartialDeep<ProductVariant>> = [],
): PartialDeep<ProductVariant> | undefined => {
  return (
    variants instanceof Array ? variants : flattenConnection(variants)
  ).find((variant) => variant?.availableForSale);
};

function useVariantPath(handle: string) {
  const {pathname, search} = useLocation();

  return useMemo(() => {
    const match = /(\/[a-zA-Z]{2}-[a-zA-Z]{2}\/)/g.exec(pathname);
    const isLocalePathname = match && match.length > 0;

    const path = isLocalePathname
      ? `${match![0]}products/${handle}`
      : `/products/${handle}`;

    const searchParams = new URLSearchParams(search);

    return {
      searchParams,
      // If the current pathname matches the product page, we need to make sure
      // that we append to the current search params. Otherwise all the search
      // params can be generated new.
      alreadyOnProductPage: path === pathname,
      path,
    };
  }, [pathname, search, handle]);
}

export function useVariantUrl(
  /** The product handle for the generated URL */
  handle: string,
  /** A list of product options from the [Storefront API](/docs/api/storefront/2023-04/objects/ProductOption) to include in the URL search params. */
  selectedOptions: SelectedOptionInput[],
) {
  const {searchParams, alreadyOnProductPage, path} = useVariantPath(handle);

  return useMemo(() => {
    const clonedSearchParams = new URLSearchParams(
      alreadyOnProductPage ? searchParams : undefined,
    );

    selectedOptions.forEach((option) => {
      clonedSearchParams.set(option.name, option.value);
    });

    const searchString = clonedSearchParams.toString();

    return {
      to: `${path}${searchString ? '?' + searchString : ''}`,
      search: `?${searchString}`,
    };
  }, [searchParams, alreadyOnProductPage, path, selectedOptions]);
}
