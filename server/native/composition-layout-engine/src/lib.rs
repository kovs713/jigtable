use std::cmp::Ordering;

use napi::{Error, Result};
use napi_derive::napi;

#[napi(object)]
pub struct SourceImage {
    pub id: String,
    pub src: String,
    pub width: f64,
    pub height: f64,
}

#[napi(object)]
pub struct CompositionLayoutInput {
    pub images: Vec<SourceImage>,
    pub image_count: Option<f64>,
}

#[napi(string_enum)]
#[derive(Debug, PartialEq, Eq)]
pub enum CompositionLayoutKind {
    Justified,
    Bento,
}

#[napi(object)]
#[derive(Default)]
pub struct CompositionLayoutOptions {
    pub gap: Option<f64>,
    pub target_aspect_ratio: Option<f64>,
    pub target_image_area: Option<f64>,
    pub max_aspect_ratio_distortion: Option<f64>,

    pub layout: Option<CompositionLayoutKind>,
}

#[napi(object)]
pub struct CanvasLayout {
    pub width: f64,
    pub height: f64,
}

#[napi(object)]
pub struct CompositionLayoutItem {
    pub id: String,
    pub src: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub scale: f64,
}

#[napi(object)]
pub struct CompositionLayout {
    pub canvas: CanvasLayout,
    pub items: Vec<CompositionLayoutItem>,
}

#[derive(Clone)]
struct ValidatedImage {
    id: String,
    src: String,
    width: f64,
    height: f64,
}

#[derive(Clone)]
struct PackingImage {
    id: String,
    src: String,
    order: usize,
    source_width: f64,
    aspect_ratio: f64,
}

#[derive(Clone)]
struct PackedImage {
    image: PackingImage,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Clone)]
struct PackedGroup {
    width: f64,
    height: f64,
    images: Vec<PackedImage>,
}

#[derive(Clone, Copy)]
enum BentoDirection {
    Horizontal,
    Vertical,
}

const DEFAULT_GAP: f64 = 0.0;
const DEFAULT_MAX_ASPECT_RATIO_DISTORTION: f64 = 1.5;

#[napi(js_name = "generateCompositionLayout")]
pub fn generate_composition_layout(
    input: CompositionLayoutInput,
    options: Option<CompositionLayoutOptions>,
) -> Result<CompositionLayout> {
    let images = input
        .images
        .into_iter()
        .map(validate_image)
        .collect::<Result<Vec<_>>>()?;

    if let Some(count) = input.image_count {
        if count.round() as usize != images.len() {
            return Err(Error::from_reason(
                "Composition image count must match images length",
            ));
        }
    }

    if images.is_empty() {
        return Ok(CompositionLayout {
            canvas: CanvasLayout {
                width: 0.0,
                height: 0.0,
            },
            items: vec![],
        });
    }

    let options = options.unwrap_or_default();
    let gap = normalize_non_negative_number(options.gap, DEFAULT_GAP, "gap")?;
    let target_aspect_ratio = normalize_positive_number(
        options.target_aspect_ratio,
        Some(median(
            images
                .iter()
                .map(|image| image.width / image.height)
                .collect(),
        )?),
        "targetAspectRatio",
    )?;
    let target_image_area = normalize_positive_number(
        options.target_image_area,
        Some(median(
            images
                .iter()
                .map(|image| image.width * image.height)
                .collect(),
        )?),
        "targetImageArea",
    )?;
    let max_aspect_ratio_distortion = normalize_minimum_number(
        options.max_aspect_ratio_distortion,
        DEFAULT_MAX_ASPECT_RATIO_DISTORTION,
        1.0,
        "maxAspectRatioDistortion",
    )?;
    let layout = options.layout.unwrap_or(CompositionLayoutKind::Justified);
    let mut packing_images = images
        .iter()
        .enumerate()
        .map(|(order, image)| PackingImage {
            id: image.id.clone(),
            src: image.src.clone(),
            order,
            source_width: image.width,
            aspect_ratio: image.width / image.height,
        })
        .collect::<Vec<_>>();

    if layout == CompositionLayoutKind::Justified {
        packing_images.sort_by(compare_packing_images);
    }

    let mut packed_images = pack_images(
        &packing_images,
        layout,
        target_image_area,
        target_aspect_ratio,
        gap,
        max_aspect_ratio_distortion,
    )?;
    let canvas = create_packed_canvas(&packed_images)?;

    packed_images.sort_by(|left, right| left.image.order.cmp(&right.image.order));

    let items = packed_images
        .into_iter()
        .map(|image| CompositionLayoutItem {
            id: image.image.id,
            src: image.image.src,
            x: image.x,
            y: image.y,
            width: image.width,
            height: image.height,
            scale: round(image.width / image.image.source_width),
        })
        .collect();

    Ok(CompositionLayout { canvas, items })
}

fn pack_images(
    images: &[PackingImage],
    layout: CompositionLayoutKind,
    target_image_area: f64,
    target_aspect_ratio: f64,
    gap: f64,
    max_aspect_ratio_distortion: f64,
) -> Result<Vec<PackedImage>> {
    match layout {
        CompositionLayoutKind::Justified => pack_justified(
            images,
            target_image_area,
            target_aspect_ratio,
            gap,
            max_aspect_ratio_distortion,
        ),

        CompositionLayoutKind::Bento => {
            pack_bento(images, target_image_area, target_aspect_ratio, gap)
        }
    }
}

fn pack_justified(
    images: &[PackingImage],
    target_image_area: f64,
    target_aspect_ratio: f64,
    gap: f64,
    max_aspect_ratio_distortion: f64,
) -> Result<Vec<PackedImage>> {
    let mut layouts = (1..=images.len())
        .map(|row_count| {
            let rows = partition_rows(images, row_count)?;
            let packed_images = pack_rows(&rows, target_image_area, gap)?;
            let canvas = create_packed_canvas(&packed_images)?;
            let score = score_layout(
                &rows,
                &packed_images,
                &canvas,
                target_aspect_ratio,
                max_aspect_ratio_distortion,
            )?;

            Ok((score, packed_images))
        })
        .collect::<Result<Vec<_>>>()?;

    layouts.sort_by(|left, right| left.0.partial_cmp(&right.0).unwrap_or(Ordering::Equal));

    layouts
        .into_iter()
        .next()
        .map(|(_, images)| images)
        .ok_or_else(|| Error::from_reason("Could not build composition canvas layout"))
}

fn pack_bento(
    images: &[PackingImage],
    target_image_area: f64,
    target_aspect_ratio: f64,
    gap: f64,
) -> Result<Vec<PackedImage>> {
    if images.is_empty() {
        return Err(Error::from_reason(
            "Could not build bento composition layout",
        ));
    }

    let group = pack_bento_group(images, target_image_area, target_aspect_ratio, gap)?;

    Ok(group.images)
}

fn pack_bento_group(
    images: &[PackingImage],
    target_image_area: f64,
    target_aspect_ratio: f64,
    gap: f64,
) -> Result<PackedGroup> {
    if images.is_empty() {
        return Err(Error::from_reason("Could not build empty bento group"));
    }

    if images.len() == 1 {
        let image = images
            .first()
            .ok_or_else(|| Error::from_reason("Could not build bento image group"))?;

        return Ok(create_bento_leaf(image, target_image_area));
    }

    let split_index = choose_bento_split_index(images);

    let first_images = images
        .get(..split_index)
        .ok_or_else(|| Error::from_reason("Could not split first bento image group"))?;

    let second_images = images
        .get(split_index..)
        .ok_or_else(|| Error::from_reason("Could not split second bento image group"))?;

    let first = pack_bento_group(first_images, target_image_area, target_aspect_ratio, gap)?;

    let second = pack_bento_group(second_images, target_image_area, target_aspect_ratio, gap)?;

    let horizontal = combine_bento_groups(
        first.clone(),
        second.clone(),
        BentoDirection::Horizontal,
        gap,
    );

    let vertical = combine_bento_groups(first, second, BentoDirection::Vertical, gap);

    let horizontal_score = score_bento_group(&horizontal, target_aspect_ratio);

    let vertical_score = score_bento_group(&vertical, target_aspect_ratio);

    if horizontal_score <= vertical_score {
        Ok(horizontal)
    } else {
        Ok(vertical)
    }
}

fn create_bento_leaf(image: &PackingImage, target_image_area: f64) -> PackedGroup {
    /*
     * width / height = aspect_ratio
     * width * height = target_image_area
     */
    let width = (target_image_area * image.aspect_ratio).sqrt().max(1.0);

    let height = (target_image_area / image.aspect_ratio).sqrt().max(1.0);

    PackedGroup {
        width,
        height,
        images: vec![PackedImage {
            image: image.clone(),
            x: 0.0,
            y: 0.0,
            width,
            height,
        }],
    }
}

fn choose_bento_split_index(images: &[PackingImage]) -> usize {
    /*
     * Делим примерно пополам.
     *
     * Для нечётного количества первая группа будет меньше:
     *
     * 3 -> 1 + 2
     * 5 -> 2 + 3
     */
    (images.len() / 2).max(1)
}

fn combine_bento_groups(
    mut first: PackedGroup,
    mut second: PackedGroup,
    direction: BentoDirection,
    gap: f64,
) -> PackedGroup {
    match direction {
        BentoDirection::Horizontal => {
            let height = first.height.max(second.height);

            let first_scale = height / first.height;
            let second_scale = height / second.height;

            scale_packed_group(&mut first, first_scale);
            scale_packed_group(&mut second, second_scale);

            translate_packed_group(&mut second, first.width + gap, 0.0);

            let width = first.width + gap + second.width;

            let mut images = first.images;
            images.extend(second.images);

            PackedGroup {
                width,
                height,
                images,
            }
        }

        BentoDirection::Vertical => {
            let width = first.width.max(second.width);

            let first_scale = width / first.width;
            let second_scale = width / second.width;

            scale_packed_group(&mut first, first_scale);
            scale_packed_group(&mut second, second_scale);

            translate_packed_group(&mut second, 0.0, first.height + gap);

            let height = first.height + gap + second.height;

            let mut images = first.images;
            images.extend(second.images);

            PackedGroup {
                width,
                height,
                images,
            }
        }
    }
}

fn scale_packed_group(group: &mut PackedGroup, scale: f64) {
    group.width *= scale;
    group.height *= scale;

    for image in &mut group.images {
        image.x *= scale;
        image.y *= scale;
        image.width *= scale;
        image.height *= scale;
    }
}

fn translate_packed_group(group: &mut PackedGroup, offset_x: f64, offset_y: f64) {
    for image in &mut group.images {
        image.x += offset_x;
        image.y += offset_y;
    }
}

fn score_bento_group(group: &PackedGroup, target_aspect_ratio: f64) -> f64 {
    let canvas_aspect_ratio = group.width / group.height;

    let aspect_ratio_score = (canvas_aspect_ratio / target_aspect_ratio).ln().abs();

    let area_spread_score = score_bento_area_spread(&group.images);

    aspect_ratio_score + area_spread_score * 0.2
}

fn score_bento_area_spread(images: &[PackedImage]) -> f64 {
    let min_area = images
        .iter()
        .map(|image| image.width * image.height)
        .fold(f64::INFINITY, f64::min);

    let max_area = images
        .iter()
        .map(|image| image.width * image.height)
        .fold(0.0, f64::max);

    if min_area <= 0.0 || !min_area.is_finite() {
        return f64::INFINITY;
    }

    (max_area / min_area).ln().abs()
}

fn partition_rows(images: &[PackingImage], row_count: usize) -> Result<Vec<Vec<PackingImage>>> {
    let mut rows = Vec::new();
    let mut image_index = 0;
    let mut remaining_aspect = sum(images.iter().map(|image| image.aspect_ratio));

    for row_index in 0..row_count {
        let mut row = Vec::new();
        let mut row_aspect = 0.0;

        while image_index < images.len() {
            let image = images
                .get(image_index)
                .ok_or_else(|| Error::from_reason("Could not build composition layout"))?;
            let remaining_rows_after_this = row_count - row_index - 1;
            let remaining_images_after_this = images.len() - image_index - 1;

            if !row.is_empty() && remaining_images_after_this < remaining_rows_after_this {
                break;
            }

            if !row.is_empty() && row_index < row_count - 1 {
                let target_row_aspect = remaining_aspect / (row_count - row_index) as f64;
                let current_difference = (row_aspect - target_row_aspect).abs();
                let next_difference = (row_aspect + image.aspect_ratio - target_row_aspect).abs();

                if current_difference <= next_difference {
                    break;
                }
            }

            row.push(image.clone());
            row_aspect += image.aspect_ratio;
            image_index += 1;
        }

        if row.is_empty() {
            return Err(Error::from_reason("Could not build composition layout"));
        }

        rows.push(row);
        remaining_aspect -= row_aspect;
    }

    Ok(rows)
}

fn pack_rows(
    rows: &[Vec<PackingImage>],
    target_image_area: f64,
    gap: f64,
) -> Result<Vec<PackedImage>> {
    let image_count = sum(rows.iter().map(|row| row.len() as f64));
    let target_area = image_count.max(target_image_area * image_count);
    let canvas_width = calculate_canvas_width(rows, target_area, gap);
    let mut packed_images = Vec::new();
    let mut y = 0.0;

    for (row_index, row) in rows.iter().enumerate() {
        let is_last_row = row_index == rows.len() - 1;
        let row_gap = gap * row.len().saturating_sub(1) as f64;
        let available_width = canvas_width - row_gap;
        let row_aspect = sum(row.iter().map(|image| image.aspect_ratio));
        let row_height = (available_width / row_aspect).round().max(1.0);
        let widths = distribute_size(available_width, row.iter().map(|image| image.aspect_ratio))?;
        let mut x = 0.0;

        for (item_index, image) in row.iter().enumerate() {
            let width = *widths
                .get(item_index)
                .ok_or_else(|| Error::from_reason("Could not build composition layout"))?;

            packed_images.push(PackedImage {
                image: image.clone(),
                x,
                y,
                width,
                height: row_height,
            });
            x += width + gap;
        }

        y += row_height + if is_last_row { 0.0 } else { gap };
    }

    Ok(packed_images)
}

fn calculate_canvas_width(rows: &[Vec<PackingImage>], target_area: f64, gap: f64) -> f64 {
    let mut quadratic = 0.0;
    let mut linear = 0.0;
    let mut constant = 0.0;
    let mut min_width: f64 = 1.0;

    for row in rows {
        let row_aspect = sum(row.iter().map(|image| image.aspect_ratio));
        let row_gap = gap * row.len().saturating_sub(1) as f64;

        quadratic += 1.0 / row_aspect;
        linear += row_gap / row_aspect;
        constant += (row_gap * row_gap) / row_aspect;
        min_width = min_width.max(row.len() as f64 + row_gap);
    }

    let discriminant = (linear * linear - quadratic * (constant - target_area)).max(0.0);
    let width = (linear + discriminant.sqrt()) / quadratic;

    width.round().max(min_width)
}

fn score_layout(
    rows: &[Vec<PackingImage>],
    images: &[PackedImage],
    canvas: &CanvasLayout,
    target_aspect_ratio: f64,
    max_aspect_ratio_distortion: f64,
) -> Result<f64> {
    let canvas_aspect_ratio = canvas.width / canvas.height;
    let aspect_ratio_score = (canvas_aspect_ratio / target_aspect_ratio).ln().abs();
    let row_heights = collect_row_heights(rows, images)?;
    let min_height = row_heights.iter().copied().fold(f64::INFINITY, f64::min);
    let max_height = row_heights.iter().copied().fold(0.0, f64::max);
    let height_spread_score = (max_height / min_height).ln();
    let distortion = max_packed_aspect_ratio_distortion(images);
    let distortion_score = if distortion > max_aspect_ratio_distortion {
        (distortion / max_aspect_ratio_distortion).ln() * 100.0
    } else {
        0.0
    };

    Ok(aspect_ratio_score + height_spread_score * 0.25 + distortion_score)
}

fn collect_row_heights(rows: &[Vec<PackingImage>], images: &[PackedImage]) -> Result<Vec<f64>> {
    let mut heights = Vec::new();
    let mut image_index = 0;

    for row in rows {
        let image = images
            .get(image_index)
            .ok_or_else(|| Error::from_reason("Could not build composition layout"))?;

        heights.push(image.height);
        image_index += row.len();
    }

    Ok(heights)
}

fn max_packed_aspect_ratio_distortion(images: &[PackedImage]) -> f64 {
    images
        .iter()
        .map(|image| {
            let aspect_ratio = image.width / image.height;

            (aspect_ratio / image.image.aspect_ratio).max(image.image.aspect_ratio / aspect_ratio)
        })
        .fold(0.0, f64::max)
}

fn create_packed_canvas(images: &[PackedImage]) -> Result<CanvasLayout> {
    if images.is_empty() {
        return Err(Error::from_reason("Could not build composition layout"));
    }

    Ok(CanvasLayout {
        width: images
            .iter()
            .map(|image| image.x + image.width)
            .fold(0.0, f64::max),
        height: images
            .iter()
            .map(|image| image.y + image.height)
            .fold(0.0, f64::max),
    })
}

fn distribute_size<I>(total_size: f64, weights: I) -> Result<Vec<f64>>
where
    I: IntoIterator<Item = f64>,
{
    let weights = weights.into_iter().collect::<Vec<_>>();

    if total_size < weights.len() as f64 {
        return Err(Error::from_reason("Could not build composition layout"));
    }

    let total_weight = sum(weights.iter().copied());
    let remaining_size = total_size - weights.len() as f64;
    let mut sizes = weights
        .iter()
        .map(|weight| 1.0 + ((remaining_size * weight) / total_weight).floor())
        .collect::<Vec<_>>();
    let mut remainder = total_size - sum(sizes.iter().copied());
    let mut fractions = weights
        .iter()
        .enumerate()
        .map(|(index, weight)| Fraction {
            index,
            value: ((remaining_size * weight) / total_weight) % 1.0,
        })
        .collect::<Vec<_>>();

    fractions.sort_by(|left, right| {
        right
            .value
            .partial_cmp(&left.value)
            .unwrap_or(Ordering::Equal)
            .then_with(|| left.index.cmp(&right.index))
    });

    for fraction in fractions {
        if remainder <= 0.0 {
            break;
        }

        if let Some(size) = sizes.get_mut(fraction.index) {
            *size += 1.0;
        }
        remainder -= 1.0;
    }

    Ok(sizes)
}

struct Fraction {
    index: usize,
    value: f64,
}

fn compare_packing_images(left: &PackingImage, right: &PackingImage) -> Ordering {
    right
        .aspect_ratio
        .partial_cmp(&left.aspect_ratio)
        .unwrap_or(Ordering::Equal)
        .then_with(|| left.order.cmp(&right.order))
}

fn validate_image(image: SourceImage) -> Result<ValidatedImage> {
    if image.id.is_empty() {
        return Err(Error::from_reason("Composition image id is required"));
    }

    if image.src.is_empty() {
        return Err(Error::from_reason("Composition image src is required"));
    }

    Ok(ValidatedImage {
        id: image.id,
        src: image.src,
        width: normalize_positive_number(Some(image.width), None, "image.width")?,
        height: normalize_positive_number(Some(image.height), None, "image.height")?,
    })
}

fn normalize_positive_number(value: Option<f64>, fallback: Option<f64>, name: &str) -> Result<f64> {
    let normalized = value.or(fallback).ok_or_else(|| {
        Error::from_reason(format!(
            "Composition image {name} must be a positive number"
        ))
    })?;

    if !normalized.is_finite() || normalized <= 0.0 {
        return Err(Error::from_reason(format!(
            "Composition image {name} must be a positive number"
        )));
    }

    Ok(normalized)
}

fn normalize_non_negative_number(value: Option<f64>, fallback: f64, name: &str) -> Result<f64> {
    let normalized = value.unwrap_or(fallback);

    if !normalized.is_finite() || normalized < 0.0 {
        return Err(Error::from_reason(format!(
            "Composition image {name} must be a non-negative number"
        )));
    }

    Ok(normalized)
}

fn normalize_minimum_number(
    value: Option<f64>,
    fallback: f64,
    min: f64,
    name: &str,
) -> Result<f64> {
    let normalized = value.unwrap_or(fallback);

    if !normalized.is_finite() || normalized < min {
        return Err(Error::from_reason(format!(
            "Composition image {name} must be at least {min}"
        )));
    }

    Ok(normalized)
}

fn median(mut values: Vec<f64>) -> Result<f64> {
    values.sort_by(|left, right| left.partial_cmp(right).unwrap_or(Ordering::Equal));

    let middle = values.len() / 2;

    if values.len() % 2 == 1 {
        return values
            .get(middle)
            .copied()
            .ok_or_else(|| Error::from_reason("Could not calculate median"));
    }

    let left = values
        .get(middle - 1)
        .copied()
        .ok_or_else(|| Error::from_reason("Could not calculate median"))?;
    let right = values
        .get(middle)
        .copied()
        .ok_or_else(|| Error::from_reason("Could not calculate median"))?;

    Ok((left + right) / 2.0)
}

fn sum<I>(values: I) -> f64
where
    I: IntoIterator<Item = f64>,
{
    values.into_iter().sum()
}

fn round(value: f64) -> f64 {
    (value * 1_000_000.0).round() * 0.000_001
}
