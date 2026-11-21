// Recipe from DaProdEditorVideo 1.x, src/core/effettiClip.ts (MIT).
struct Params { mix: f32 }
fn effect(uv: vec2<f32>) -> vec4<f32> {
    let pixel = sample(uv);
    let graded = contrast(saturation(pixel.rgb, 1.50), 1.14) + vec3<f32>(0.00);
    return vec4<f32>(mix(pixel.rgb, graded, params.mix / 100.0), pixel.a);
}
